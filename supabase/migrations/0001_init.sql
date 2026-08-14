-- Health Connect sync schema
--
-- One table per Health Connect record type. Every table carries a
-- `health_connect_id` unique key derived from the record's Health Connect
-- metadata id (see android app `SyncSpecs.kt`), so pushes from the Android
-- app are plain upserts (`Prefer: resolution=merge-duplicates` on
-- `health_connect_id`) and safe to retry/replay without creating dupes.
--
-- `user_id` exists on every table so the schema doesn't have to change if
-- you ever add a second device/person; for a single-user setup it defaults
-- to 'default_user' and you can ignore it.
--
-- RLS: per your call, this is a single-user personal project, so every
-- table is locked to the `anon` role with a fully permissive policy. That
-- makes the Supabase anon key *equivalent to a password* for this data —
-- keep it out of git (it already is, via .gitignore) and never ship it in
-- a public/distributed APK. If you ever want stricter isolation, swap
-- these policies for ones keyed on `auth.uid()` and switch the app to
-- Supabase Auth.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- steps
-- ---------------------------------------------------------------------------
create table if not exists public.steps (
  id               uuid primary key default gen_random_uuid(),
  health_connect_id text not null unique,
  user_id          text not null default 'default_user',
  start_time       timestamptz not null,
  end_time         timestamptz not null,
  count            bigint not null,
  source_package   text,
  synced_at        timestamptz not null default now()
);
create index if not exists steps_start_time_idx on public.steps (start_time);
create index if not exists steps_user_id_idx on public.steps (user_id);

-- ---------------------------------------------------------------------------
-- heart_rate_samples
-- Health Connect groups samples into records; we flatten to one row per
-- sample, so health_connect_id is "<record metadata id>:<sample epoch ms>".
-- ---------------------------------------------------------------------------
create table if not exists public.heart_rate_samples (
  id               uuid primary key default gen_random_uuid(),
  health_connect_id text not null unique,
  user_id          text not null default 'default_user',
  sample_time      timestamptz not null,
  bpm              integer not null,
  source_package   text,
  synced_at        timestamptz not null default now()
);
create index if not exists heart_rate_samples_sample_time_idx on public.heart_rate_samples (sample_time);
create index if not exists heart_rate_samples_user_id_idx on public.heart_rate_samples (user_id);

-- ---------------------------------------------------------------------------
-- sleep_sessions / sleep_stages
-- ---------------------------------------------------------------------------
create table if not exists public.sleep_sessions (
  id               uuid primary key default gen_random_uuid(),
  health_connect_id text not null unique,
  user_id          text not null default 'default_user',
  start_time       timestamptz not null,
  end_time         timestamptz not null,
  title            text,
  notes            text,
  source_package   text,
  synced_at        timestamptz not null default now()
);
create index if not exists sleep_sessions_start_time_idx on public.sleep_sessions (start_time);

create table if not exists public.sleep_stages (
  id                     uuid primary key default gen_random_uuid(),
  health_connect_id      text not null unique,
  session_health_connect_id text not null references public.sleep_sessions (health_connect_id) on delete cascade,
  user_id                text not null default 'default_user',
  start_time             timestamptz not null,
  end_time               timestamptz not null,
  -- raw Health Connect SleepSessionRecord.Stage.stage int code (see README
  -- "Health Connect code reference" table for what the numbers mean)
  stage_type_code        integer not null,
  synced_at              timestamptz not null default now()
);
create index if not exists sleep_stages_session_idx on public.sleep_stages (session_health_connect_id);

-- ---------------------------------------------------------------------------
-- exercise_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.exercise_sessions (
  id               uuid primary key default gen_random_uuid(),
  health_connect_id text not null unique,
  user_id          text not null default 'default_user',
  start_time       timestamptz not null,
  end_time         timestamptz not null,
  -- raw Health Connect ExerciseSessionRecord.exerciseType int code
  exercise_type_code integer not null,
  title            text,
  notes            text,
  source_package   text,
  synced_at        timestamptz not null default now()
);
create index if not exists exercise_sessions_start_time_idx on public.exercise_sessions (start_time);

-- ---------------------------------------------------------------------------
-- blood_oxygen (SpO2)
-- ---------------------------------------------------------------------------
create table if not exists public.blood_oxygen (
  id               uuid primary key default gen_random_uuid(),
  health_connect_id text not null unique,
  user_id          text not null default 'default_user',
  sample_time      timestamptz not null,
  percentage       numeric not null,
  source_package   text,
  synced_at        timestamptz not null default now()
);
create index if not exists blood_oxygen_sample_time_idx on public.blood_oxygen (sample_time);

-- ---------------------------------------------------------------------------
-- blood_pressure
-- ---------------------------------------------------------------------------
create table if not exists public.blood_pressure (
  id                       uuid primary key default gen_random_uuid(),
  health_connect_id        text not null unique,
  user_id                  text not null default 'default_user',
  sample_time              timestamptz not null,
  systolic_mmhg            numeric not null,
  diastolic_mmhg           numeric not null,
  body_position_code       integer,
  measurement_location_code integer,
  source_package           text,
  synced_at                timestamptz not null default now()
);
create index if not exists blood_pressure_sample_time_idx on public.blood_pressure (sample_time);

-- ---------------------------------------------------------------------------
-- respiratory_rate
-- ---------------------------------------------------------------------------
create table if not exists public.respiratory_rate (
  id               uuid primary key default gen_random_uuid(),
  health_connect_id text not null unique,
  user_id          text not null default 'default_user',
  sample_time      timestamptz not null,
  breaths_per_minute numeric not null,
  source_package   text,
  synced_at        timestamptz not null default now()
);
create index if not exists respiratory_rate_sample_time_idx on public.respiratory_rate (sample_time);

-- ---------------------------------------------------------------------------
-- Row Level Security — permissive anon-role policies (see header comment)
-- ---------------------------------------------------------------------------
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
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_anon_select', t);
    execute format(
      'create policy %I on public.%I for select using (true)',
      t || '_anon_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_anon_insert', t);
    execute format(
      'create policy %I on public.%I for insert to anon with check (true)',
      t || '_anon_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_anon_update', t);
    execute format(
      'create policy %I on public.%I for update to anon using (true) with check (true)',
      t || '_anon_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_anon_delete', t);
    execute format(
      'create policy %I on public.%I for delete to anon using (true)',
      t || '_anon_delete', t
    );
  end loop;
end $$;
