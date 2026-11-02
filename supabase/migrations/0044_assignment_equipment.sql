-- Equipment field for a prescribed exercise -- per the plan, this lives
-- only on assignment_components (set when a coach actually prescribes an
-- exercise to a client), not on template_components. A library exercise
-- doesn't commit to one piece of equipment (the same movement might be
-- barbell one week, dumbbell the next for a given client), so there's
-- nothing to snapshot at assignment time -- _assign_workout_snapshot and
-- generate_recurring_occurrences (0033/0039) are untouched; every row
-- they insert simply gets equipment = null until a coach sets it via
-- updateAssignedExercise.
--
-- A closed set rather than free text (unlike timeline_entries.entry_type,
--0036) -- this maps straight onto the four equipment icons already
-- shipped (components/icons/{Barbell,Dumbbell,Kettlebell,Bodyweight}Icon.tsx)
-- plus a generic "other" catch-all, not an open-ended list of kinds.
alter table public.assignment_components
  add column if not exists equipment text
  check (equipment is null or equipment in ('barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'other'));
