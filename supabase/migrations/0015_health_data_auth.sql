-- Phase 6, part 1: real per-client auth on the 8 health-data tables,
-- replacing the wide-open `anon`-role policies from 0001_init.sql (see
-- that file's header comment -- this is exactly the "if you ever want
-- stricter isolation" swap it flagged as a future step).
--
-- Adds `client_id` (an auth.uid()-matching profiles.id) to every table
-- and backfills it from the existing free-text `user_id` column by
-- matching against client_profiles.sync_code -- the same code the
-- Android app has been stamping into `user_id` since
-- 0003_sync_code.sql. Rows with no matching sync_code, including the
-- pre-multi-tenant 'default_user' rows from before the coach/client
-- pivot even existed, are left with client_id = null on purpose: they
-- simply become unreachable under the new policies below rather than
-- being deleted or reassigned to someone. `user_id`/`sync_code`
-- themselves are left in place, just no longer load-bearing for access
-- control.
--
-- New RLS mirrors the dual-ownership subquery pattern
-- `profiles_select_as_coach` already established in 0002_accounts.sql --
-- client owns their own rows outright, their coach gets read-only
-- access via the same client_profiles.coach_id lookup, nobody else (in
-- particular the `anon` role) gets anything.

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
    execute format('alter table public.%I add column if not exists client_id uuid references public.profiles (id) on delete cascade', t);
    execute format('create index if not exists %I on public.%I (client_id)', t || '_client_id_idx', t);

    execute format(
      'update public.%I t set client_id = cp.profile_id from public.client_profiles cp where t.user_id = cp.sync_code and t.client_id is null',
      t
    );

    -- Drop the old anon-permissive policies from 0001_init.sql.
    execute format('drop policy if exists %I on public.%I', t || '_anon_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_delete', t);

    execute format(
      'create policy %I on public.%I for all using (client_id = auth.uid()) with check (client_id = auth.uid())',
      t || '_client_all', t
    );
    execute format(
      'create policy %I on public.%I for select using (client_id in (select profile_id from public.client_profiles where coach_id = auth.uid()))',
      t || '_coach_select', t
    );
  end loop;
end $$;
