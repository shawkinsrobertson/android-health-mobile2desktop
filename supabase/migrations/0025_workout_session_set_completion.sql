-- The Android app's workout-logging screen (unlike the web SessionLogger)
-- shows a per-SET checkmark, not just the exercise-level "completed" flag
-- 0009_workout_sessions.sql already added -- a client marks off each set
-- as they finish it, not the exercise as a whole. workout_session_sets had
-- no boolean for that. Additive and default false, so the web dashboard
-- (which doesn't read or write it yet) is unaffected.
alter table public.workout_session_sets
  add column if not exists completed boolean not null default false;
