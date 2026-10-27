-- Primitives restructure, pass 4: Metric.
--
-- Collapses the 9 per-Health-Connect-type tables (steps, heart_rate_
-- samples, sleep_sessions, sleep_stages, exercise_sessions, blood_oxygen,
-- blood_pressure, respiratory_rate, blood_glucose -- 0001_init.sql,
-- 0015/0022/0024) into one `metrics` table with a `metric_type`
-- discriminator and a `value` jsonb column holding whatever fields are
-- specific to that type. Unlike `templates.type` and `assignments.type`,
-- `metric_type` carries NO check constraint -- that's the actual point:
-- 0014_client_data_consent.sql said the same thing about data_type and
-- then shipped a CHECK anyway (closed in 0032_visibility_scope.sql); this
-- table is built schema-free from day one, so a 10th Health Connect type
-- is a new row shape, not a migration.
--
-- Additive: old tables stay, ids are preserved. The Android sync engine
-- (SyncRepository.kt) already writes generically by table name/row-map
-- from SyncSpec.kt -- it needed zero structural changes, only its
-- onConflict target gains metric_type (see that file's own commit) and
-- SyncSpec.kt's 9 specs now all point at "metrics" with type-tagged rows.
--
-- One relaxation, called out explicitly: sleep_stages.session_fkey (a
-- real composite FK to sleep_sessions(client_id, health_connect_id),
-- added in 0022) has no equivalent here -- Postgres FKs can't target a
-- jsonb field, and a sleep_stage's session_health_connect_id now lives
-- inside `value`. This doesn't change actual delete behavior: Android's
-- deleteRecord already removes a session's stages by health_connect_id
-- *prefix* match (stage ids are "<session id>_stage_N"), independent of
-- the Postgres FK, which only ever mattered for a direct SQL delete
-- outside the app -- something this product has never done.

create table if not exists public.metrics (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.profiles (id) on delete cascade,
  metric_type       text not null,
  health_connect_id text not null,
  start_time        timestamptz not null,
  end_time          timestamptz,
  value             jsonb not null default '{}'::jsonb,
  source_package    text,
  synced_at         timestamptz not null default now(),
  unique (client_id, metric_type, health_connect_id)
);
create index if not exists metrics_client_id_idx on public.metrics (client_id);
create index if not exists metrics_metric_type_idx on public.metrics (metric_type);
create index if not exists metrics_start_time_idx on public.metrics (start_time);

alter table public.metrics enable row level security;

drop policy if exists metrics_client_all on public.metrics;
create policy metrics_client_all on public.metrics
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists metrics_coach_select on public.metrics;
create policy metrics_coach_select on public.metrics
  for select using (client_id in (select profile_id from public.client_profiles where coach_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Backfill -- ids preserved, every type-specific column folded into value.
-- ---------------------------------------------------------------------------
insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'steps', health_connect_id, start_time, end_time,
       jsonb_build_object('count', count), source_package, synced_at
from public.steps
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'heart_rate', health_connect_id, sample_time, null,
       jsonb_build_object('bpm', bpm), source_package, synced_at
from public.heart_rate_samples
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'sleep_session', health_connect_id, start_time, end_time,
       jsonb_build_object('title', title, 'notes', notes), source_package, synced_at
from public.sleep_sessions
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, synced_at)
select id, client_id, 'sleep_stage', health_connect_id, start_time, end_time,
       jsonb_build_object('session_health_connect_id', session_health_connect_id, 'stage_type_code', stage_type_code), synced_at
from public.sleep_stages
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'exercise_session', health_connect_id, start_time, end_time,
       jsonb_build_object('exercise_type_code', exercise_type_code, 'title', title, 'notes', notes), source_package, synced_at
from public.exercise_sessions
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'blood_oxygen', health_connect_id, sample_time, null,
       jsonb_build_object('percentage', percentage), source_package, synced_at
from public.blood_oxygen
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'blood_pressure', health_connect_id, sample_time, null,
       jsonb_build_object(
         'systolic_mmhg', systolic_mmhg,
         'diastolic_mmhg', diastolic_mmhg,
         'body_position_code', body_position_code,
         'measurement_location_code', measurement_location_code
       ), source_package, synced_at
from public.blood_pressure
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'respiratory_rate', health_connect_id, sample_time, null,
       jsonb_build_object('breaths_per_minute', breaths_per_minute), source_package, synced_at
from public.respiratory_rate
where client_id is not null
on conflict (id) do nothing;

insert into public.metrics (id, client_id, metric_type, health_connect_id, start_time, end_time, value, source_package, synced_at)
select id, client_id, 'blood_glucose', health_connect_id, sample_time, null,
       jsonb_build_object(
         'level_mg_dl', level_mg_dl,
         'specimen_source_code', specimen_source_code,
         'meal_type_code', meal_type_code,
         'relation_to_meal_code', relation_to_meal_code
       ), source_package, synced_at
from public.blood_glucose
on conflict (id) do nothing;
