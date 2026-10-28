-- Primitives restructure, pass 6: drop the pre-restructure tables.
--
-- 0033-0036 migrated Template/Assignment/Metric/Timeline onto new unified
-- tables and left the old ones in place as a safety net while every
-- consumer (dashboard + Android) got cut over. That cutover is done and
-- has been running on `main` since PR #18 -- re-confirmed with a fresh
-- repo-wide grep immediately before writing this migration, finding zero
-- remaining `.from(...)`/`.select(...)` references to any table below
-- anywhere in dashboard/ or android/ (the only hits were AI tool names
-- like `get_library_exercises`, PostgREST relation aliases like
-- `assigned_workouts:assignments(name)`, and metric_type/consent-key
-- string values that happen to share a name with an old table, none of
-- which are an actual reference to these tables). This is the destructive
-- follow-up those migrations' comments flagged as deliberately deferred.
--
-- Drop order follows each group's own FK dependency graph (children
-- before parents); `cascade` is still used on each statement as a second
-- line of defense, not as a substitute for ordering correctly.

-- ---------------------------------------------------------------------------
-- Template (0033): library_* -- also drops the two join tables and the
-- workout-blocks grouping table.
-- ---------------------------------------------------------------------------
drop table if exists public.library_workout_exercises cascade;
drop table if exists public.library_program_workouts cascade;
drop table if exists public.library_workout_blocks cascade;
drop table if exists public.library_documents cascade;
drop table if exists public.library_programs cascade;
drop table if exists public.library_workouts cascade;
drop table if exists public.library_exercises cascade;

-- ---------------------------------------------------------------------------
-- Assignment (0034): assigned_* + document_responses. workout_sessions/
-- workout_session_exercises/workout_session_sets are NOT touched -- their
-- FKs were already repointed at assignments/assignment_components in
-- 0034, so they have no remaining dependency on anything dropped here.
-- ---------------------------------------------------------------------------
drop table if exists public.document_responses cascade;
drop table if exists public.assigned_workout_exercises cascade;
drop table if exists public.assigned_workout_blocks cascade;
drop table if exists public.assigned_documents cascade;
drop table if exists public.assigned_workouts cascade;
drop table if exists public.assigned_programs cascade;

-- ---------------------------------------------------------------------------
-- Metric (0035): the 9 original per-Health-Connect-type tables.
-- sleep_stages has a composite FK onto sleep_sessions (0022), so it drops
-- first regardless of cascade.
-- ---------------------------------------------------------------------------
drop table if exists public.sleep_stages cascade;
drop table if exists public.steps cascade;
drop table if exists public.heart_rate_samples cascade;
drop table if exists public.sleep_sessions cascade;
drop table if exists public.exercise_sessions cascade;
drop table if exists public.blood_oxygen cascade;
drop table if exists public.blood_pressure cascade;
drop table if exists public.respiratory_rate cascade;
drop table if exists public.blood_glucose cascade;

-- ---------------------------------------------------------------------------
-- Timeline (0036, notes only): coach_notes.
-- ---------------------------------------------------------------------------
drop table if exists public.coach_notes cascade;
