-- Invite links were being marked 'used' the moment a prospective client
-- requested a magic link (requestClientMagicLink -> signInWithOtp), not
-- when they actually clicked it. signInWithOtp creates the auth.users row
-- immediately, unconfirmed, which fires handle_new_user() on INSERT --
-- the old version of that trigger flipped invite_links.status to 'used'
-- right there. If the same person reloaded /join/[token] (typo'd email,
-- didn't see the message yet, checking status) before clicking the email
-- link, invite_status.status was already 'used', and JoinPage showed
-- "invalid, already used, or expired" to the same person mid-redemption.
-- The email itself always sent fine -- only the status flip was premature.
--
-- Fix: split "create the profile rows" (fine to do early, on INSERT) from
-- "consume the invite" (should wait for the person to actually confirm,
-- i.e. click the link -- app/auth/confirm's verifyOtp() call is what sets
-- auth.users.email_confirmed_at). handle_new_user() keeps creating
-- profiles/client_profiles as before; invite consumption moves to a new
-- trigger that fires only when email_confirmed_at transitions from null
-- to not-null.

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

    -- Invite consumption itself no longer happens here -- see
    -- handle_user_confirmed() below, fired once the person actually
    -- clicks the emailed link instead of on this unconfirmed insert.
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- handle_user_confirmed -- marks the invite_links row 'used' once the
-- person actually confirms (auth/confirm's verifyOtp() sets
-- email_confirmed_at). Re-reads the invite by the same token carried in
-- signup metadata (unchanged since insert); still checks status='pending'
-- and not expired, matching handle_new_user()'s own guard, in case the
-- link expired or got used elsewhere in the gap between request and
-- confirmation.
-- ---------------------------------------------------------------------------
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_token text := new.raw_user_meta_data ->> 'invite_token';
begin
  if v_invite_token is not null then
    update public.invite_links
       set status = 'used', used_by = new.id, used_at = now()
     where token = v_invite_token
       and status = 'pending'
       and expires_at > now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();
