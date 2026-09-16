-- Coach-owned content libraries: exercises, workouts, programs, documents.
--
-- These are LIVE references, not snapshots: a workout holds a join row per
-- exercise (library_workout_exercises), a program holds a join row per
-- workout (library_program_workouts). Editing a library_exercises row is
-- immediately visible everywhere it's still referenced by an unassigned
-- workout/program -- there is no denormalized copy at this layer. Snapshot
-- freezing happens only at assignment time (see 0005_assigned.sql) into a
-- structurally separate set of assigned_* tables that never re-read these
-- live.
--
-- RLS: every table here is coach-owned outright (coach_id = auth.uid(),
-- single `for all` policy) -- clients never read these tables directly,
-- only their assigned_* snapshots (0005_assigned.sql).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- library_exercises
-- ---------------------------------------------------------------------------
create table if not exists public.library_exercises (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  category     text,
  instructions text,
  -- Media: either an uploaded Storage object (library-media bucket, path
  -- below) or an external URL, or both -- if both are set the uploaded
  -- copy is preferred at display time (see lib/media.ts).
  photo_path   text,
  photo_url    text,
  video_path   text,
  video_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists library_exercises_coach_id_idx on public.library_exercises (coach_id);

-- ---------------------------------------------------------------------------
-- library_workouts
-- ---------------------------------------------------------------------------
create table if not exists public.library_workouts (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  description text,
  photo_path  text,
  photo_url   text,
  video_path  text,
  video_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists library_workouts_coach_id_idx on public.library_workouts (coach_id);

-- ---------------------------------------------------------------------------
-- library_workout_exercises -- join: which exercises a workout prescribes,
-- in order, with per-workout prescription detail (sets/reps/rest/etc --
-- this data belongs to the *join*, not the exercise, since the same
-- exercise is prescribed differently in different workouts).
--
-- coach_id is denormalized from the parent workout so RLS never needs a
-- join to check ownership. exercise_id is `on delete restrict` so a
-- still-referenced exercise can't be deleted out from under a workout --
-- see the delete actions for the friendly error this produces.
-- ---------------------------------------------------------------------------
create table if not exists public.library_workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  workout_id   uuid not null references public.library_workouts (id) on delete cascade,
  exercise_id  uuid not null references public.library_exercises (id) on delete restrict,
  order_index  integer not null default 0,
  sets         integer,
  reps         text, -- text, not integer: coaches write "8-12", "AMRAP", etc.
  weight_note  text,
  rest_seconds integer,
  tempo        text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists library_workout_exercises_workout_id_idx on public.library_workout_exercises (workout_id);
create index if not exists library_workout_exercises_exercise_id_idx on public.library_workout_exercises (exercise_id);

-- ---------------------------------------------------------------------------
-- library_programs
-- ---------------------------------------------------------------------------
create table if not exists public.library_programs (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  description text,
  photo_path  text,
  photo_url   text,
  video_path  text,
  video_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists library_programs_coach_id_idx on public.library_programs (coach_id);

-- ---------------------------------------------------------------------------
-- library_program_workouts -- join: which workouts a program includes, and
-- in what order. week_number/day_of_week are optional scheduling metadata.
-- ---------------------------------------------------------------------------
create table if not exists public.library_program_workouts (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  program_id   uuid not null references public.library_programs (id) on delete cascade,
  workout_id   uuid not null references public.library_workouts (id) on delete restrict,
  order_index  integer not null default 0,
  week_number  integer,
  day_of_week  integer check (day_of_week between 1 and 7),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists library_program_workouts_program_id_idx on public.library_program_workouts (program_id);
create index if not exists library_program_workouts_workout_id_idx on public.library_program_workouts (workout_id);

-- ---------------------------------------------------------------------------
-- library_documents -- either a plain uploaded/linked file, or a dynamic
-- form. form_schema is a jsonb array of field definitions:
--   [{ id, type: "text"|"number"|"dropdown"|"checkbox"|"multiple_choice"|"file_upload",
--      label, required, options? }, ...]
-- (dropdown/multiple_choice carry `options: string[]`; other types omit it
-- -- see dashboard/lib/forms.ts for the matching TS types.)
-- ---------------------------------------------------------------------------
create table if not exists public.library_documents (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  description   text,
  document_type text not null check (document_type in ('file', 'form')),
  file_path     text,
  file_url      text,
  form_schema   jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint library_documents_type_shape check (
    (document_type = 'form' and form_schema is not null and file_path is null and file_url is null)
    or
    (document_type = 'file' and form_schema is null)
  )
);
create index if not exists library_documents_coach_id_idx on public.library_documents (coach_id);

-- ---------------------------------------------------------------------------
-- Storage: single private bucket for all library/assigned media + document
-- files + form-response file uploads. Never public=true; reads always go
-- through createSignedUrl() (see lib/media.ts), gated by the RLS policies
-- below, same as every other table in this project.
--
-- Path convention: {coach_id}/exercises/..., {coach_id}/workouts/...,
-- {coach_id}/programs/..., {coach_id}/documents/...,
-- {coach_id}/responses/{assigned_document_id}/... (client-uploaded form
-- answers -- see the client policies added in 0005_assigned.sql once
-- assigned_documents exists).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('library-media', 'library-media', false)
on conflict (id) do nothing;

-- Coach: full read/write/delete on objects under their own uid prefix.
drop policy if exists library_media_coach_all on storage.objects;
create policy library_media_coach_all on storage.objects
  for all
  using (bucket_id = 'library-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'library-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- RLS -- coach fully owns their library; clients never read these tables.
-- ---------------------------------------------------------------------------
alter table public.library_exercises enable row level security;
alter table public.library_workouts enable row level security;
alter table public.library_workout_exercises enable row level security;
alter table public.library_programs enable row level security;
alter table public.library_program_workouts enable row level security;
alter table public.library_documents enable row level security;

drop policy if exists library_exercises_coach_all on public.library_exercises;
create policy library_exercises_coach_all on public.library_exercises
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists library_workouts_coach_all on public.library_workouts;
create policy library_workouts_coach_all on public.library_workouts
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists library_workout_exercises_coach_all on public.library_workout_exercises;
create policy library_workout_exercises_coach_all on public.library_workout_exercises
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists library_programs_coach_all on public.library_programs;
create policy library_programs_coach_all on public.library_programs
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists library_program_workouts_coach_all on public.library_program_workouts;
create policy library_program_workouts_coach_all on public.library_program_workouts
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists library_documents_coach_all on public.library_documents;
create policy library_documents_coach_all on public.library_documents
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());
