-- AI assistant Stage 8: draft programs from a text prompt. Same shape and
-- same reasoning as migration 0029 for library_workouts -- see that
-- file's comment. A drafted program's workouts are themselves either
-- pre-existing published workouts or newly drafted ones (also status =
-- 'draft' until the coach publishes them), but the program's own status
-- is tracked independently here so a program can be reviewed/published on
-- its own schedule.

alter table public.library_programs
  add column if not exists status text not null default 'published' check (status in ('draft', 'published'));
