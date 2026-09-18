-- Shared calendar, pass 2: Google Calendar OAuth connections + the one
-- narrow cross-user exception this feature needs (a coach forcing a
-- refresh of a specific client's calendar -- see PLANNING.md's Phase 7
-- section for the full reasoning).
--
-- access_token/refresh_token store ciphertext produced by
-- dashboard/lib/calendar-crypto.ts (Node's own crypto, AES-256-GCM) --
-- Postgres never sees a plaintext token and never holds the encryption
-- key itself. That's a deliberate simplification over encrypting inside
-- Postgres via pgcrypto: this way the key only ever needs to be
-- configured in one place (the app's CALENDAR_TOKEN_ENC_KEY env var),
-- not kept in sync between the app and a Postgres setting too.

create table if not exists public.calendar_connections (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null references public.profiles (id) on delete cascade,
  provider               text not null check (provider in ('google')),
  access_token           text not null,
  refresh_token          text not null,
  expires_at             timestamptz not null,
  scope                  text not null,
  external_account_email text,
  sync_token             text,
  last_synced_at         timestamptz,
  created_at             timestamptz not null default now(),
  unique (profile_id, provider)
);
create index if not exists calendar_connections_profile_id_idx on public.calendar_connections (profile_id);

alter table public.calendar_connections enable row level security;

-- Single-owner, same shape as coach_notes -- nobody else, coach
-- included, ever gets a policy granting them a row here directly. The
-- coach's own access path is the function below, not RLS.
drop policy if exists calendar_connections_owner_all on public.calendar_connections;
create policy calendar_connections_owner_all on public.calendar_connections
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- The one deliberate, narrow exception to "RLS is the real boundary, no
-- cross-user access anywhere" (established during the Phase 6 auth
-- rearchitecture): lets a coach force a sync of a specific client's
-- calendar (their own "Sync now" button doesn't help if the client
-- hasn't opened the app in days). Still returns encrypted ciphertext,
-- never a decrypted token -- the calling server action
-- (lib/calendar-sync-actions.ts) is the only thing that ever decrypts,
-- and it never exposes the raw value to the browser.
create or replace function public.get_calendar_sync_token(p_profile_id uuid)
returns table (access_token text, refresh_token text, expires_at timestamptz, sync_token text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id != auth.uid() and not exists (
    select 1 from public.client_profiles
     where profile_id = p_profile_id and coach_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select cc.access_token, cc.refresh_token, cc.expires_at, cc.sync_token
      from public.calendar_connections cc
     where cc.profile_id = p_profile_id and cc.provider = 'google';
end;
$$;

-- Companion write-path for the same authorization check -- persists a
-- refreshed access token and/or the sync completion state
-- (sync_token/last_synced_at) after a sync pass, whether that pass was
-- triggered by the connection's own owner or by their coach.
-- access_token/refresh_token/expires_at are only overwritten when a
-- refresh actually happened this call (coalesce against the existing
-- value); sync_token/last_synced_at are always set explicitly since
-- clearing sync_token to null (forcing a full resync after a 410) is a
-- real, intentional state, not "leave unchanged."
create or replace function public.update_calendar_sync_state(
  p_profile_id uuid,
  p_sync_token text,
  p_last_synced_at timestamptz,
  p_access_token text default null,
  p_refresh_token text default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id != auth.uid() and not exists (
    select 1 from public.client_profiles
     where profile_id = p_profile_id and coach_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update public.calendar_connections
     set sync_token      = p_sync_token,
         last_synced_at  = p_last_synced_at,
         access_token    = coalesce(p_access_token, access_token),
         refresh_token   = coalesce(p_refresh_token, refresh_token),
         expires_at      = coalesce(p_expires_at, expires_at)
   where profile_id = p_profile_id and provider = 'google';
end;
$$;
