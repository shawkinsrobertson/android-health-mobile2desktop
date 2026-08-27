-- Client sync codes -- the bridge between a client's account and their
-- own synced Health Connect data.
--
-- Today the Android app writes every row under a shared `user_id`
-- ('default_user', the health-data tables' column default) with no
-- concept of who's who -- fine for one person, but it means a second
-- person syncing from the same Supabase project would have their data
-- mixed into the exact same rows. A sync_code is a short code shown once
-- a client's account exists; entering it in the Android app (stored
-- on-device, no rebuild needed) makes that device tag its pushes with
-- this code as `user_id` instead of the default, and the dashboard
-- filters a client's own view by their own code.
--
-- This is a lightweight bridge, not the real fix -- see PLANNING.md
-- Phase 6. The health-data tables' RLS is still the permissive anon-role
-- policy from 0001_init.sql, so this scopes what each person *sees*, not
-- real database-level isolation. Fine for a small trusted team testing a
-- prototype; revisit before this is anything more than that.

alter table public.client_profiles
  add column if not exists sync_code text unique;

-- Backfill any client_profiles rows created before this migration.
update public.client_profiles
   set sync_code = upper(substr(md5(random()::text || clock_timestamp()::text || profile_id::text), 1, 8))
 where sync_code is null;

alter table public.client_profiles
  alter column sync_code set not null;

-- Extend handle_new_user() to generate one for every new client too.
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

    insert into public.client_profiles (profile_id, coach_id, sync_code)
    values (
      new.id,
      invite.coach_id, -- null coach_id if the invite was missing/expired/used
      upper(substr(md5(random()::text || clock_timestamp()::text || new.id::text), 1, 8))
    )
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
