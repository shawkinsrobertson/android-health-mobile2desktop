-- Workout tracking/logging. An assigned workout is followed repeatedly
-- over time (e.g. every Monday for weeks), so each time a client actually
-- does it, they log a new "session" rather than there being one
-- completion flag on the assigned workout itself -- this is the "variance
-- from what was prescribed" tracking flagged as open in PLANNING.md's
-- Phase 2 notes.
--
-- Actuals are logged per exercise (not per individual set): sets/reps-or-
-- duration/weight done, a plain complete toggle for exercises the client
-- just wants to check off, a free-text note, and a manually-flagged PR
-- (no automatic PR detection across history -- that's progression
-- analysis, explicitly deferred to a later data-viz phase). Follows the
-- existing convention of free-text weight/reps fields (matches
-- library_workout_exercises.weight_note/reps) rather than rigid numerics.

create table if not exists public.workout_sessions (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.profiles (id) on delete cascade,
  coach_id             uuid not null references public.profiles (id) on delete cascade,
  assigned_workout_id  uuid not null references public.assigned_workouts (id) on delete cascade,
  performed_on         date not null default current_date,
  completed_at         timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists workout_sessions_assigned_workout_id_idx on public.workout_sessions (assigned_workout_id);
create index if not exists workout_sessions_client_id_idx on public.workout_sessions (client_id);
create index if not exists workout_sessions_coach_id_idx on public.workout_sessions (coach_id);

create table if not exists public.workout_session_exercises (
  id                          uuid primary key default gen_random_uuid(),
  session_id                  uuid not null references public.workout_sessions (id) on delete cascade,
  client_id                   uuid not null references public.profiles (id) on delete cascade,
  coach_id                    uuid not null references public.profiles (id) on delete cascade,
  assigned_workout_exercise_id uuid not null references public.assigned_workout_exercises (id) on delete cascade,
  completed                   boolean not null default false,
  is_pr                       boolean not null default false,
  actual_sets                 integer,
  actual_reps                 text,
  actual_duration_seconds     integer,
  actual_weight                text,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (session_id, assigned_workout_exercise_id)
);
create index if not exists workout_session_exercises_session_id_idx on public.workout_session_exercises (session_id);

alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;

drop policy if exists workout_sessions_select on public.workout_sessions;
create policy workout_sessions_select on public.workout_sessions
  for select using (client_id = auth.uid() or coach_id = auth.uid());
drop policy if exists workout_sessions_insert_own on public.workout_sessions;
create policy workout_sessions_insert_own on public.workout_sessions
  for insert with check (client_id = auth.uid());
drop policy if exists workout_sessions_update_own on public.workout_sessions;
create policy workout_sessions_update_own on public.workout_sessions
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists workout_sessions_delete_own on public.workout_sessions;
create policy workout_sessions_delete_own on public.workout_sessions
  for delete using (client_id = auth.uid());

drop policy if exists workout_session_exercises_select on public.workout_session_exercises;
create policy workout_session_exercises_select on public.workout_session_exercises
  for select using (client_id = auth.uid() or coach_id = auth.uid());
drop policy if exists workout_session_exercises_insert_own on public.workout_session_exercises;
create policy workout_session_exercises_insert_own on public.workout_session_exercises
  for insert with check (client_id = auth.uid());
drop policy if exists workout_session_exercises_update_own on public.workout_session_exercises;
create policy workout_session_exercises_update_own on public.workout_session_exercises
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists workout_session_exercises_delete_own on public.workout_session_exercises;
create policy workout_session_exercises_delete_own on public.workout_session_exercises
  for delete using (client_id = auth.uid());
