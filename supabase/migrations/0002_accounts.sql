-- Accounts: coaches, clients, and invite-based client onboarding.
--
-- This is new, additive structure that sits alongside the existing
-- single-user Health Connect tables (steps, heart_rate_samples, etc.) --
-- those tables and their permissive anon-role RLS are UNTOUCHED here.
-- Wiring a specific client's synced health data to their account is a
-- later phase (it requires the Android app to authenticate as that
-- client instead of using one shared anon key); today's slice is just
-- the account/relationship layer.
--
-- Auth: Supabase Auth (magic link). `profiles` mirrors `auth.users` 1:1.
-- Relationship model: one coach per client (a client's coach is a column
-- on client_profiles, not a join table -- simplest schema for the current
-- product decision; easy to migrate to a join table later if multi-coach
-- support becomes a real requirement).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles -- one row per auth.users row, created by the trigger below.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('coach', 'client')),
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- client_profiles -- client-only fields, including the coach relationship
-- and the intake info captured during onboarding.
-- ---------------------------------------------------------------------------
create table if not exists public.client_profiles (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  coach_id        uuid references public.profiles (id) on delete set null,
  phone           text,
  goals           text,
  limitations     text,
  -- up to 3 keys from the Health Connect data types this client wants
  -- surfaced on their dashboard, e.g. {"steps","sleep_sessions","heart_rate_samples"}
  top_data_points text[] not null default '{}',
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint client_profiles_top_data_points_max3 check (array_length(top_data_points, 1) is null or array_length(top_data_points, 1) <= 3)
);
create index if not exists client_profiles_coach_id_idx on public.client_profiles (coach_id);

-- ---------------------------------------------------------------------------
-- invite_links -- a coach generates one of these per prospective client;
-- the token is the capability, so the app never lists these to anon
-- directly (see invite_status view below).
-- ---------------------------------------------------------------------------
create table if not exists public.invite_links (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,
  coach_id   uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'used', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by    uuid references public.profiles (id) on delete set null,
  used_at    timestamptz
);
create index if not exists invite_links_coach_id_idx on public.invite_links (coach_id);

-- Narrow, public-safe view for the /join/[token] page to validate a token
-- before the visitor has any account -- exposes only what's needed to
-- render the join screen, never the full invite_links row.
create or replace view public.invite_status as
select
  i.token,
  i.status,
  i.expires_at,
  p.full_name as coach_name
from public.invite_links i
join public.profiles p on p.id = i.coach_id;

-- The view runs with its owner's privileges (not the querying role's RLS),
-- so it can read invite_links/profiles even though anon has no policies on
-- either -- that's the point: it's the one deliberately narrow window into
-- an otherwise-locked-down table. Grant anon+authenticated select on the
-- view only, never on the base tables.
grant select on public.invite_status to anon, authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user -- on every auth.users insert, create the matching
-- profiles row (and client_profiles row for clients). Role and, for
-- clients, the invite token, travel in as auth signup metadata (set by
-- the app when calling signInWithOtp -- see app/login and app/join).
-- security definer so it can write regardless of the caller's RLS.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role         text := coalesce(new.raw_user_meta_data ->> 'role', 'coach');
  v_invite_token text := new.raw_user_meta_data ->> 'invite_token';
  invite         public.invite_links;
begin
  insert into public.profiles (id, role, email, full_name)
  values (new.id, v_role, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  if v_role = 'client' then
    if v_invite_token is not null then
      select * into invite
        from public.invite_links
       where token = v_invite_token
         and status = 'pending'
         and expires_at > now();
    end if;

    insert into public.client_profiles (profile_id, coach_id)
    values (new.id, invite.coach_id) -- null coach_id if the invite was missing/expired/used
    on conflict (profile_id) do nothing;

    if invite.id is not null then
      update public.invite_links
         set status = 'used', used_by = new.id, used_at = now()
       where id = invite.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.client_profiles enable row level security;
alter table public.invite_links enable row level security;

-- profiles: you can see/update your own row; a coach can see their clients'.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_as_coach on public.profiles;
create policy profiles_select_as_coach on public.profiles
  for select using (
    id in (select profile_id from public.client_profiles where coach_id = auth.uid())
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- client_profiles: the client owns their row; their coach can read it.
drop policy if exists client_profiles_select_own on public.client_profiles;
create policy client_profiles_select_own on public.client_profiles
  for select using (profile_id = auth.uid());

drop policy if exists client_profiles_select_as_coach on public.client_profiles;
create policy client_profiles_select_as_coach on public.client_profiles
  for select using (coach_id = auth.uid());

drop policy if exists client_profiles_update_own on public.client_profiles;
create policy client_profiles_update_own on public.client_profiles
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- invite_links: only the issuing coach can see or create their own links.
-- (Token validation for anonymous visitors goes through invite_status.)
drop policy if exists invite_links_select_own on public.invite_links;
create policy invite_links_select_own on public.invite_links
  for select using (coach_id = auth.uid());

drop policy if exists invite_links_insert_own on public.invite_links;
create policy invite_links_insert_own on public.invite_links
  for insert with check (coach_id = auth.uid());
