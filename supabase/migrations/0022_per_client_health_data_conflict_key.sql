-- Phase 6 follow-up: health_connect_id was unique per *table*, not per
-- client -- fine for the original single-user app (0001_init.sql), wrong
-- now that different accounts can share one physical device's Health
-- Connect history. Re-syncing a device under a *different* account than
-- whatever last wrote these tables (a reused test phone, a device handed
-- to a new client later, ...) hits the exact same health_connect_id
-- values, and PostgREST's on_conflict=health_connect_id turns the upsert
-- into an UPDATE against a row some *other* account owns -- RLS
-- correctly refuses that (the error names "USING expression": the
-- *existing* row's client_id doesn't match the syncing account). This is
-- exactly what happened testing the Android login flow against a device
-- that already had pre-multi-tenant test data for the same Health
-- Connect records.
--
-- health_connect_id only ever needs to be unique *within one client's
-- own data* -- two different real users' own devices colliding on a
-- Health-Connect-assigned id would mean something else is very wrong;
-- the same device's history getting re-synced under a different account
-- is the realistic case, and shouldn't fight over one global key.

-- 1. Drop the rows 0015_health_data_auth.sql's backfill explicitly left
--    orphaned ("unreachable... on purpose") -- nothing can see them
--    under current RLS, and leaving them in place is exactly what
--    collided above. sleep_sessions cascades its own orphaned
--    sleep_stages rows on delete (see 0001_init.sql's FK).
delete from public.steps where client_id is null;
delete from public.heart_rate_samples where client_id is null;
delete from public.sleep_sessions where client_id is null;
delete from public.sleep_stages where client_id is null;
delete from public.exercise_sessions where client_id is null;
delete from public.blood_oxygen where client_id is null;
delete from public.blood_pressure where client_id is null;
delete from public.respiratory_rate where client_id is null;

-- 2. sleep_stages.client_id was backfilled independently (via its own
--    user_id/sync_code, same as every other table in 0015) rather than
--    from its parent sleep_sessions row -- force them consistent before
--    the composite FK below requires it.
update public.sleep_stages ss
   set client_id = s.client_id
  from public.sleep_sessions s
 where ss.session_health_connect_id = s.health_connect_id
   and ss.client_id is distinct from s.client_id;

-- 3. sleep_stages' FK has to be dropped before sleep_sessions' old
--    (global) unique constraint, its target, can be.
alter table public.sleep_stages drop constraint if exists sleep_stages_session_health_connect_id_fkey;

-- 4. Swap health_connect_id's uniqueness from global to per-client on
--    all 8 tables, and require client_id now that nothing should ever
--    insert a row without one -- the app's own upsert always stamps it
--    (see SyncRepository.kt's pushRecords) and RLS's WITH CHECK already
--    rejects a null client_id from landing here again regardless.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'steps',
      'heart_rate_samples',
      'sleep_sessions',
      'sleep_stages',
      'exercise_sessions',
      'blood_oxygen',
      'blood_pressure',
      'respiratory_rate'
    ])
  loop
    execute format('alter table public.%I alter column client_id set not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_health_connect_id_key');
    execute format(
      'alter table public.%I add constraint %I unique (client_id, health_connect_id)',
      t, t || '_client_health_connect_id_key'
    );
  end loop;
end $$;

-- 5. Re-add sleep_stages' FK against the new composite key.
alter table public.sleep_stages
  add constraint sleep_stages_session_fkey
  foreign key (client_id, session_health_connect_id)
  references public.sleep_sessions (client_id, health_connect_id)
  on delete cascade;
