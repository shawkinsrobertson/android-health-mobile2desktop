-- AI assistant Stage 4: draft workouts from a text prompt. Unlike draft
-- messages/program changes/scheduling (migration 0028), a drafted workout
-- has a natural home of its own -- the coach's existing Workouts list --
-- so it stages there directly via a status column rather than through
-- ai_assistant_proposals. A 'draft' row is otherwise a completely normal
-- library_workouts row (same editor, same delete), it's just excluded
-- from every assignment picker until a coach explicitly publishes it --
-- see the application-side filters added alongside this migration. That
-- exclusion, not this column alone, is what actually enforces "the
-- assistant never assigns anything to a client."

alter table public.library_workouts
  add column if not exists status text not null default 'published' check (status in ('draft', 'published'));
