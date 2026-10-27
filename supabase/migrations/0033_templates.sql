-- Primitives restructure, pass 2: Template.
--
-- Collapses library_exercises/library_workouts/library_programs/
-- library_documents (0004_libraries.sql) plus their composition tables
-- library_workout_exercises/library_program_workouts and the grouping
-- table library_workout_blocks (0008_workout_blocks.sql) into one
-- `templates` table with a `type` discriminator, and two generic
-- composition tables: `template_components` (the join -- a workout's
-- exercises, or a program's workouts) and `template_component_groups`
-- (the superset/circuit grouping a workout's exercises can share).
--
-- Additive: this migration creates the new tables and backfills them from
-- the existing data, preserving every row's original id. It does NOT drop
-- library_exercises/workouts/programs/documents/workout_exercises/
-- program_workouts/workout_blocks, and does NOT touch assigned_* (the
-- Assignment primitive is a separate, later pass) -- assigned_workout_
-- blocks.source_block_id still points at library_workout_blocks, which
-- still exists, so that FK stays valid untouched.
--
-- What DOES change here: _assign_workout_snapshot/assign_program_to_client/
-- assign_document_to_client now read their source content from
-- templates/template_components/template_component_groups instead of the
-- library_* tables. Leaving them pointed at library_* while the dashboard's
-- authoring UI (next commit) moves to writing templates/template_components
-- would silently stale the assignment pipeline the moment a coach edited
-- anything post-cutover -- the RPCs' source-of-truth has to move in the
-- same migration as the table they're sourced from, even though Assignment
-- itself (the assigned_* destination tables) isn't being touched yet.
--
-- Status: exercises never got a draft/published column (0029/0030/0031
-- added it to workouts/documents/programs only, because nothing ever
-- needed an AI-drafted exercise) -- that gap closes here for free, since
-- every row in one shared table gets the same column.

-- ---------------------------------------------------------------------------
-- templates
-- ---------------------------------------------------------------------------
create table if not exists public.templates (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable only for shared base exercises (0006_shared_exercises.sql) --
  -- enforced below, not by dropping not null outright for every type.
  coach_id      uuid references public.profiles (id) on delete cascade,
  type          text not null check (type in ('exercise', 'workout', 'program', 'document')),
  status        text not null default 'published' check (status in ('draft', 'published')),
  name          text not null,
  description   text,
  -- exercise-only
  category      text,
  instructions  text,
  -- exercise/workout/program media (unused by document rows)
  photo_path    text,
  photo_url     text,
  video_path    text,
  video_url     text,
  -- document-only
  document_type text check (document_type in ('file', 'form')),
  file_path     text,
  file_url      text,
  form_schema   jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint templates_shared_only_exercise check (coach_id is not null or type = 'exercise'),
  constraint templates_document_shape check (
    type <> 'document'
    or (document_type = 'form' and form_schema is not null and file_path is null and file_url is null)
    or (document_type = 'file' and form_schema is null)
  )
);
create index if not exists templates_coach_id_idx on public.templates (coach_id);
create index if not exists templates_type_idx on public.templates (type);

-- ---------------------------------------------------------------------------
-- template_component_groups -- supersets/circuits within a workout
-- template (mirrors library_workout_blocks).
-- ---------------------------------------------------------------------------
create table if not exists public.template_component_groups (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  parent_id   uuid not null references public.templates (id) on delete cascade,
  block_type  text not null check (block_type in ('superset', 'circuit')),
  rounds      integer not null default 1,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists template_component_groups_parent_id_idx on public.template_component_groups (parent_id);

-- ---------------------------------------------------------------------------
-- template_components -- generic composition join, replacing both
-- library_workout_exercises (workout -> exercise, with prescription
-- detail + optional group) and library_program_workouts (program ->
-- workout, with week/day scheduling metadata). Which edge a row
-- represents is determined by parent_id/child_id's own `type`, not a
-- separate discriminator -- a program's id is never also a workout's id,
-- so there's no ambiguity to resolve.
-- ---------------------------------------------------------------------------
create table if not exists public.template_components (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid not null references public.profiles (id) on delete cascade,
  parent_id         uuid not null references public.templates (id) on delete cascade,
  child_id          uuid not null references public.templates (id) on delete restrict,
  order_index       integer not null default 0,
  -- workout -> exercise only
  group_id          uuid references public.template_component_groups (id) on delete cascade,
  prescription_type text not null default 'reps' check (prescription_type in ('reps', 'time')),
  sets              integer,
  reps              text,
  duration_seconds  integer,
  weight_note       text,
  rest_seconds      integer,
  tempo             text,
  -- program -> workout only
  week_number       integer,
  day_of_week       integer check (day_of_week between 1 and 7),
  -- shared
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists template_components_parent_id_idx on public.template_components (parent_id);
create index if not exists template_components_child_id_idx on public.template_components (child_id);
create index if not exists template_components_group_id_idx on public.template_components (group_id);

-- ---------------------------------------------------------------------------
-- Backfill -- preserves every original row's id, so anything still
-- pointing at a library_* id by provenance (assigned_*.source_library_*_id)
-- continues to resolve to a recognizable row if cross-referenced manually.
-- ---------------------------------------------------------------------------
insert into public.templates (id, coach_id, type, status, name, category, instructions, photo_path, photo_url, video_path, video_url, created_at, updated_at)
select id, coach_id, 'exercise', 'published', name, category, instructions, photo_path, photo_url, video_path, video_url, created_at, updated_at
from public.library_exercises
on conflict (id) do nothing;

insert into public.templates (id, coach_id, type, status, name, description, photo_path, photo_url, video_path, video_url, created_at, updated_at)
select id, coach_id, 'workout', status, name, description, photo_path, photo_url, video_path, video_url, created_at, updated_at
from public.library_workouts
on conflict (id) do nothing;

insert into public.templates (id, coach_id, type, status, name, description, photo_path, photo_url, video_path, video_url, created_at, updated_at)
select id, coach_id, 'program', status, name, description, photo_path, photo_url, video_path, video_url, created_at, updated_at
from public.library_programs
on conflict (id) do nothing;

insert into public.templates (id, coach_id, type, status, name, description, document_type, file_path, file_url, form_schema, created_at, updated_at)
select id, coach_id, 'document', status, name, description, document_type, file_path, file_url, form_schema, created_at, updated_at
from public.library_documents
on conflict (id) do nothing;

insert into public.template_component_groups (id, coach_id, parent_id, block_type, rounds, notes, created_at, updated_at)
select id, coach_id, workout_id, block_type, rounds, notes, created_at, updated_at
from public.library_workout_blocks
on conflict (id) do nothing;

insert into public.template_components (id, coach_id, parent_id, child_id, order_index, group_id, prescription_type, sets, reps, duration_seconds, weight_note, rest_seconds, tempo, notes, created_at, updated_at)
select id, coach_id, workout_id, exercise_id, order_index, block_id, prescription_type, sets, reps, duration_seconds, weight_note, rest_seconds, tempo, notes, created_at, updated_at
from public.library_workout_exercises
on conflict (id) do nothing;

insert into public.template_components (id, coach_id, parent_id, child_id, order_index, week_number, day_of_week, notes, created_at)
select id, coach_id, program_id, workout_id, order_index, week_number, day_of_week, notes, created_at
from public.library_program_workouts
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS -- same shape as 0004 (coach-owned) relaxed by 0006 for shared
-- (coach_id null) exercise rows: everyone can read a shared exercise,
-- nobody can write one through the app.
-- ---------------------------------------------------------------------------
alter table public.templates enable row level security;
alter table public.template_component_groups enable row level security;
alter table public.template_components enable row level security;

drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates
  for select using (coach_id = auth.uid() or coach_id is null);
drop policy if exists templates_insert_own on public.templates;
create policy templates_insert_own on public.templates
  for insert with check (coach_id = auth.uid());
drop policy if exists templates_update_own on public.templates;
create policy templates_update_own on public.templates
  for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists templates_delete_own on public.templates;
create policy templates_delete_own on public.templates
  for delete using (coach_id = auth.uid());

drop policy if exists template_component_groups_coach_all on public.template_component_groups;
create policy template_component_groups_coach_all on public.template_component_groups
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists template_components_coach_all on public.template_components;
create policy template_components_coach_all on public.template_components
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Assignment RPCs -- source reads only, moved from library_* to
-- templates/template_components/template_component_groups. Destination
-- (assigned_*) is untouched; same signatures, same ownership checks, same
-- "no security definer, relies on the caller's own RLS" posture as
-- 0007_assignment_rpc_ownership_fix.sql / 0008_workout_blocks.sql.
-- ---------------------------------------------------------------------------
create or replace function public._assign_workout_snapshot(
  p_workout_id          uuid,
  p_client_id           uuid,
  p_assigned_program_id uuid,
  p_order_index         integer
) returns uuid
language plpgsql
as $$
declare
  v_coach_id uuid := auth.uid();
  v_workout public.templates;
  v_assigned_workout_id uuid;
  v_group record;
  v_assigned_block_id uuid;
  r record;
begin
  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  select * into v_workout from public.templates where id = p_workout_id and type = 'workout';
  if v_workout.id is null then
    raise exception 'Workout not found or not visible to this coach';
  end if;

  insert into public.assigned_workouts (
    client_id, coach_id, source_library_workout_id, assigned_program_id, order_index,
    name, description, photo_path, photo_url, video_path, video_url
  ) values (
    p_client_id, v_coach_id, v_workout.id, p_assigned_program_id, p_order_index,
    v_workout.name, v_workout.description,
    v_workout.photo_path, v_workout.photo_url, v_workout.video_path, v_workout.video_url
  ) returning id into v_assigned_workout_id;

  for v_group in
    select * from public.template_component_groups where parent_id = p_workout_id
  loop
    insert into public.assigned_workout_blocks (
      client_id, coach_id, assigned_workout_id, source_block_id, block_type, rounds, notes
    ) values (
      p_client_id, v_coach_id, v_assigned_workout_id, v_group.id, v_group.block_type, v_group.rounds, v_group.notes
    ) returning id into v_assigned_block_id;

    for r in
      select tc.*, t.name as ex_name, t.instructions as ex_instructions,
             t.photo_path as ex_photo_path, t.photo_url as ex_photo_url,
             t.video_path as ex_video_path, t.video_url as ex_video_url
      from public.template_components tc
      join public.templates t on t.id = tc.child_id
      where tc.group_id = v_group.id
      order by tc.order_index
    loop
      insert into public.assigned_workout_exercises (
        client_id, coach_id, assigned_workout_id, block_id, source_library_exercise_id, order_index,
        name, instructions, photo_path, photo_url, video_path, video_url,
        sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes
      ) values (
        p_client_id, v_coach_id, v_assigned_workout_id, v_assigned_block_id, r.child_id, r.order_index,
        r.ex_name, r.ex_instructions, r.ex_photo_path, r.ex_photo_url, r.ex_video_path, r.ex_video_url,
        r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes
      );
    end loop;
  end loop;

  for r in
    select tc.*, t.name as ex_name, t.instructions as ex_instructions,
           t.photo_path as ex_photo_path, t.photo_url as ex_photo_url,
           t.video_path as ex_video_path, t.video_url as ex_video_url
    from public.template_components tc
    join public.templates t on t.id = tc.child_id
    where tc.parent_id = p_workout_id and tc.group_id is null
    order by tc.order_index
  loop
    insert into public.assigned_workout_exercises (
      client_id, coach_id, assigned_workout_id, source_library_exercise_id, order_index,
      name, instructions, photo_path, photo_url, video_path, video_url,
      sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes
    ) values (
      p_client_id, v_coach_id, v_assigned_workout_id, r.child_id, r.order_index,
      r.ex_name, r.ex_instructions, r.ex_photo_path, r.ex_photo_url, r.ex_video_path, r.ex_video_url,
      r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes
    );
  end loop;

  return v_assigned_workout_id;
end;
$$;

create or replace function public.assign_workout_to_client(
  p_workout_id uuid,
  p_client_id  uuid
) returns uuid
language plpgsql
as $$
begin
  return public._assign_workout_snapshot(p_workout_id, p_client_id, null, null);
end;
$$;

create or replace function public.assign_program_to_client(
  p_program_id uuid,
  p_client_id  uuid
) returns uuid
language plpgsql
as $$
declare
  v_coach_id uuid := auth.uid();
  v_program public.templates;
  v_assigned_program_id uuid;
  r record;
begin
  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  select * into v_program from public.templates where id = p_program_id and type = 'program';
  if v_program.id is null then
    raise exception 'Program not found or not visible to this coach';
  end if;

  insert into public.assigned_programs (
    client_id, coach_id, source_library_program_id, name, description,
    photo_path, photo_url, video_path, video_url
  ) values (
    p_client_id, v_coach_id, v_program.id, v_program.name, v_program.description,
    v_program.photo_path, v_program.photo_url, v_program.video_path, v_program.video_url
  ) returning id into v_assigned_program_id;

  for r in
    select * from public.template_components
    where parent_id = p_program_id
    order by order_index
  loop
    perform public._assign_workout_snapshot(
      r.child_id, p_client_id, v_assigned_program_id, r.order_index
    );
  end loop;

  return v_assigned_program_id;
end;
$$;

create or replace function public.assign_document_to_client(
  p_document_id uuid,
  p_client_id   uuid
) returns uuid
language plpgsql
as $$
declare
  v_coach_id uuid := auth.uid();
  v_doc public.templates;
  v_assigned_id uuid;
begin
  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  select * into v_doc from public.templates where id = p_document_id and type = 'document';
  if v_doc.id is null then
    raise exception 'Document not found or not visible to this coach';
  end if;

  insert into public.assigned_documents (
    client_id, coach_id, source_library_document_id, document_type, name, description,
    file_path, file_url, form_schema
  ) values (
    p_client_id, v_coach_id, v_doc.id, v_doc.document_type, v_doc.name, v_doc.description,
    v_doc.file_path, v_doc.file_url, v_doc.form_schema
  ) returning id into v_assigned_id;

  return v_assigned_id;
end;
$$;
