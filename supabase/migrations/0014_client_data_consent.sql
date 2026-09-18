-- Data-sharing consent (Phase 4): per-client, per-data-type preference,
-- keyed by the same DATA_POINTS taxonomy the dashboard already uses (see
-- dashboard/app/client/data-points.ts) -- one row per (client, data type),
-- so adding a new data type later is a new row shape, not a schema change.
--
-- This is visibility-only for now. Declining a type here doesn't stop the
-- Android app from syncing it -- that enforcement needs the app to know
-- which client it's syncing as *before* deciding what to read from Health
-- Connect, which depends on Phase 6's per-client mobile auth (see
-- PLANNING.md's Phase 4/Phase 6 sections). All this table does today is
-- record the client's stated preference and let their coach see it.
--
-- Coach/client dual-ownership, same denormalized-coach_id pattern as
-- coach_notes/chat_calls -- but one-sided: the client owns their own
-- consent rows outright (they're the one whose data it is), the coach
-- only ever gets read access, never write.

create table if not exists public.client_data_consent (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  data_type   text not null check (
    data_type in (
      'steps',
      'heart_rate_samples',
      'sleep_sessions',
      'exercise_sessions',
      'blood_oxygen',
      'blood_pressure',
      'respiratory_rate'
    )
  ),
  consented   boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (client_id, data_type)
);
create index if not exists client_data_consent_client_id_idx on public.client_data_consent (client_id);
create index if not exists client_data_consent_coach_id_idx on public.client_data_consent (coach_id);

alter table public.client_data_consent enable row level security;

drop policy if exists client_data_consent_client_all on public.client_data_consent;
create policy client_data_consent_client_all on public.client_data_consent
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists client_data_consent_coach_select on public.client_data_consent;
create policy client_data_consent_coach_select on public.client_data_consent
  for select using (coach_id = auth.uid());
