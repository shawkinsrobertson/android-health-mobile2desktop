-- Per-set logging + a running workout clock, replacing the one-row-per-
-- exercise "actuals" from 0009_workout_sessions.sql with one row per SET
-- (set number, reps-or-time, weight, rest -- each independently editable,
-- sets addable/removable during logging), and adding start/pause/resume
-- state for the workout-level timer shown while a session is in progress.

-- ---------------------------------------------------------------------------
-- workout_sessions: timer state. started_at null = not started yet;
-- paused_at set = currently paused (elapsed display freezes);
-- total_paused_seconds accumulates every pause/resume cycle so elapsed
-- time = now() - started_at - total_paused_seconds (minus the open pause,
-- if any) without needing to store individual pause intervals.
-- ---------------------------------------------------------------------------
alter table public.workout_sessions
  add column if not exists started_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists total_paused_seconds integer not null default 0;

-- ---------------------------------------------------------------------------
-- workout_session_sets -- one row per set actually logged. reps/
-- duration_seconds mirror assigned_workout_exercises' prescription_type
-- split (only one is meaningful per row, per the parent exercise's type).
-- weight is free text on purpose (matches library_workout_exercises.
-- weight_note) -- a client may log "135" or "BW" or "red band"; the unit
-- (client_profiles.preferred_weight_unit) is a display-only label next to
-- the field, never concatenated into the stored value.
-- ---------------------------------------------------------------------------
create table if not exists public.workout_session_sets (
  id                   uuid primary key default gen_random_uuid(),
  session_exercise_id  uuid not null references public.workout_session_exercises (id) on delete cascade,
  client_id            uuid not null references public.profiles (id) on delete cascade,
  coach_id             uuid not null references public.profiles (id) on delete cascade,
  set_number           integer not null,
  reps                 text,
  duration_seconds     integer,
  weight               text,
  rest_seconds         integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists workout_session_sets_session_exercise_id_idx on public.workout_session_sets (session_exercise_id);

alter table public.workout_session_sets enable row level security;
drop policy if exists workout_session_sets_select on public.workout_session_sets;
create policy workout_session_sets_select on public.workout_session_sets
  for select using (client_id = auth.uid() or coach_id = auth.uid());
drop policy if exists workout_session_sets_insert_own on public.workout_session_sets;
create policy workout_session_sets_insert_own on public.workout_session_sets
  for insert with check (client_id = auth.uid());
drop policy if exists workout_session_sets_update_own on public.workout_session_sets;
create policy workout_session_sets_update_own on public.workout_session_sets
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists workout_session_sets_delete_own on public.workout_session_sets;
create policy workout_session_sets_delete_own on public.workout_session_sets
  for delete using (client_id = auth.uid());

-- Per-exercise actuals now live in workout_session_sets; the aggregate
-- columns from 0009 are superseded (completed/is_pr/notes stay -- those
-- are genuinely exercise-level, not per-set).
alter table public.workout_session_exercises
  drop column if exists actual_sets,
  drop column if exists actual_reps,
  drop column if exists actual_duration_seconds,
  drop column if exists actual_weight;

-- ---------------------------------------------------------------------------
-- client_profiles: weight unit preference, carried into every set's
-- display (not stored on each set -- see workout_session_sets' comment).
-- ---------------------------------------------------------------------------
alter table public.client_profiles
  add column if not exists preferred_weight_unit text not null default 'lbs' check (preferred_weight_unit in ('lbs', 'kg'));
