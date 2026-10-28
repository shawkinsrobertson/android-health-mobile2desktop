-- Primitives restructure, pass 3: Assignment.
--
-- Collapses assigned_programs/assigned_workouts/assigned_workout_exercises/
-- assigned_workout_blocks/assigned_documents/document_responses
-- (0005_assigned.sql, 0008_workout_blocks.sql) into `assignments` (a
-- generic frozen copy, type discriminator 'workout'|'program'|'document'),
-- `assignment_components` (flattened exercise-in-workout rows -- there has
-- never been a standalone "assigned exercise," so this stays a flattened
-- child row, not a join to another assignments row), `assignment_
-- component_groups` (supersets/circuits), and `assignment_responses`
-- (document form answers).
--
-- Program -> workout nesting stays a direct nullable `parent_assignment_id`
-- + `order_index` on the child row, exactly as assigned_workouts.
-- assigned_program_id already was -- 0005's own reasoning still holds:
-- every assigned row is a private one-off copy for one client, so a
-- nullable parent FK is simpler than a join table, unlike templates'
-- many-to-many template_components (the same workout template really can
-- back many programs).
--
-- Additive, same posture as 0033_templates.sql: old tables stay, ids are
-- preserved. workout_sessions/workout_session_exercises/workout_session_
-- sets (0009/0010/0025) are NOT renamed or restructured -- only their FK
-- *targets* move from assigned_workouts/assigned_workout_exercises to
-- assignments/assignment_components, below. Their own columns (including
-- `assigned_workout_id`/`assigned_workout_exercise_id`, kept as-is on
-- purpose) are untouched, so SessionLogger.tsx, WorkoutClock.tsx, and
-- every Android session-tracking query need zero changes -- only direct
-- readers of the old assigned_* tables do (WorkoutRepository.kt's workout/
-- program/exercise display queries, not its session-tracking queries).

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.profiles (id) on delete cascade,
  coach_id             uuid not null references public.profiles (id) on delete cascade,
  type                 text not null check (type in ('workout', 'program', 'document')),
  source_template_id   uuid references public.templates (id) on delete set null,
  -- workout only -- the program assignment this workout assignment is
  -- nested under, and its position within it. Null on every program/
  -- document row and on a standalone (not-part-of-a-program) workout.
  parent_assignment_id uuid references public.assignments (id) on delete cascade,
  order_index          integer,
  name                 text not null,
  description          text,
  photo_path           text,
  photo_url            text,
  video_path           text,
  video_url            text,
  -- document only
  document_type        text check (document_type in ('file', 'form')),
  file_path            text,
  file_url             text,
  form_schema          jsonb,
  assigned_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  constraint assignments_document_shape check (
    type <> 'document'
    or (document_type = 'form' and form_schema is not null and file_path is null and file_url is null)
    or (document_type = 'file' and form_schema is null)
  )
);
create index if not exists assignments_client_id_idx on public.assignments (client_id);
create index if not exists assignments_coach_id_idx on public.assignments (coach_id);
create index if not exists assignments_parent_assignment_id_idx on public.assignments (parent_assignment_id);

-- ---------------------------------------------------------------------------
-- assignment_component_groups -- replaces assigned_workout_blocks
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_component_groups (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.profiles (id) on delete cascade,
  coach_id         uuid not null references public.profiles (id) on delete cascade,
  assignment_id    uuid not null references public.assignments (id) on delete cascade,
  source_group_id  uuid references public.template_component_groups (id) on delete set null,
  block_type       text not null check (block_type in ('superset', 'circuit')),
  rounds           integer not null default 1,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists assignment_component_groups_assignment_id_idx on public.assignment_component_groups (assignment_id);

-- ---------------------------------------------------------------------------
-- assignment_components -- replaces assigned_workout_exercises. Flattened
-- on purpose (see header): this is a frozen copy of one exercise's
-- fields + prescription, not a reference to another assignments row.
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_components (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.profiles (id) on delete cascade,
  coach_id            uuid not null references public.profiles (id) on delete cascade,
  assignment_id       uuid not null references public.assignments (id) on delete cascade,
  group_id            uuid references public.assignment_component_groups (id) on delete cascade,
  source_template_id  uuid references public.templates (id) on delete set null,
  order_index         integer not null default 0,
  name                text not null,
  instructions        text,
  photo_path          text,
  photo_url           text,
  video_path          text,
  video_url           text,
  sets                integer,
  reps                text,
  prescription_type   text not null default 'reps' check (prescription_type in ('reps', 'time')),
  duration_seconds    integer,
  weight_note         text,
  rest_seconds        integer,
  tempo               text,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists assignment_components_assignment_id_idx on public.assignment_components (assignment_id);
create index if not exists assignment_components_group_id_idx on public.assignment_components (group_id);

-- ---------------------------------------------------------------------------
-- assignment_responses -- replaces document_responses
-- ---------------------------------------------------------------------------
create table if not exists public.assignment_responses (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  client_id      uuid not null references public.profiles (id) on delete cascade,
  coach_id       uuid not null references public.profiles (id) on delete cascade,
  answers        jsonb not null default '{}'::jsonb,
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assignment_id)
);
create index if not exists assignment_responses_client_id_idx on public.assignment_responses (client_id);
create index if not exists assignment_responses_coach_id_idx on public.assignment_responses (coach_id);

-- ---------------------------------------------------------------------------
-- Backfill -- ids preserved.
-- ---------------------------------------------------------------------------
insert into public.assignments (id, client_id, coach_id, type, source_template_id, name, description, photo_path, photo_url, video_path, video_url, assigned_at, created_at)
select id, client_id, coach_id, 'program', source_library_program_id, name, description, photo_path, photo_url, video_path, video_url, assigned_at, created_at
from public.assigned_programs
on conflict (id) do nothing;

insert into public.assignments (id, client_id, coach_id, type, source_template_id, parent_assignment_id, order_index, name, description, photo_path, photo_url, video_path, video_url, assigned_at, created_at)
select id, client_id, coach_id, 'workout', source_library_workout_id, assigned_program_id, order_index, name, description, photo_path, photo_url, video_path, video_url, assigned_at, created_at
from public.assigned_workouts
on conflict (id) do nothing;

insert into public.assignments (id, client_id, coach_id, type, source_template_id, name, description, document_type, file_path, file_url, form_schema, assigned_at, created_at)
select id, client_id, coach_id, 'document', source_library_document_id, name, description, document_type, file_path, file_url, form_schema, assigned_at, created_at
from public.assigned_documents
on conflict (id) do nothing;

insert into public.assignment_component_groups (id, client_id, coach_id, assignment_id, source_group_id, block_type, rounds, notes, created_at)
select id, client_id, coach_id, assigned_workout_id, source_block_id, block_type, rounds, notes, created_at
from public.assigned_workout_blocks
on conflict (id) do nothing;

insert into public.assignment_components (id, client_id, coach_id, assignment_id, group_id, source_template_id, order_index, name, instructions, photo_path, photo_url, video_path, video_url, sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes, created_at)
select id, client_id, coach_id, assigned_workout_id, block_id, source_library_exercise_id, order_index, name, instructions, photo_path, photo_url, video_path, video_url, sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes, created_at
from public.assigned_workout_exercises
on conflict (id) do nothing;

insert into public.assignment_responses (id, assignment_id, client_id, coach_id, answers, submitted_at, created_at, updated_at)
select id, assigned_document_id, client_id, coach_id, answers, submitted_at, created_at, updated_at
from public.document_responses
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Repoint workout_sessions/workout_session_exercises' FKs onto the new
-- tables -- same ids, new target, no column rename, no app-code change.
-- ---------------------------------------------------------------------------
alter table public.workout_sessions
  drop constraint if exists workout_sessions_assigned_workout_id_fkey,
  add constraint workout_sessions_assigned_workout_id_fkey
    foreign key (assigned_workout_id) references public.assignments (id) on delete cascade;

alter table public.workout_session_exercises
  drop constraint if exists workout_session_exercises_assigned_workout_exercise_id_fkey,
  add constraint workout_session_exercises_assigned_workout_exercise_id_fkey
    foreign key (assigned_workout_exercise_id) references public.assignment_components (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Storage RLS -- same checks as 0005, pointed at the new tables.
-- ---------------------------------------------------------------------------
drop policy if exists library_media_client_upload_response on storage.objects;
create policy library_media_client_upload_response on storage.objects
  for insert
  with check (
    bucket_id = 'library-media'
    and (storage.foldername(name))[2] = 'responses'
    and exists (
      select 1 from public.assignments a
      where a.id::text = (storage.foldername(name))[3]
        and a.type = 'document'
        and a.client_id = auth.uid()
        and a.coach_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists library_media_client_select_response on storage.objects;
create policy library_media_client_select_response on storage.objects
  for select
  using (
    bucket_id = 'library-media'
    and (storage.foldername(name))[2] = 'responses'
    and exists (
      select 1 from public.assignments a
      where a.id::text = (storage.foldername(name))[3]
        and a.type = 'document'
        and a.client_id = auth.uid()
    )
  );

drop policy if exists library_media_client_select_assigned on storage.objects;
create policy library_media_client_select_assigned on storage.objects
  for select
  using (
    bucket_id = 'library-media'
    and (
      exists (select 1 from public.assignments a where a.client_id = auth.uid() and (a.photo_path = name or a.video_path = name or a.file_path = name))
      or exists (select 1 from public.assignment_components c where c.client_id = auth.uid() and (c.photo_path = name or c.video_path = name))
    )
  );

-- ---------------------------------------------------------------------------
-- RLS -- same dual client-select-own/coach-all shape as every assigned_*
-- table had individually.
-- ---------------------------------------------------------------------------
alter table public.assignments enable row level security;
alter table public.assignment_component_groups enable row level security;
alter table public.assignment_components enable row level security;
alter table public.assignment_responses enable row level security;

drop policy if exists assignments_select_own on public.assignments;
create policy assignments_select_own on public.assignments
  for select using (client_id = auth.uid());
drop policy if exists assignments_coach_all on public.assignments;
create policy assignments_coach_all on public.assignments
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists assignment_component_groups_select_own on public.assignment_component_groups;
create policy assignment_component_groups_select_own on public.assignment_component_groups
  for select using (client_id = auth.uid());
drop policy if exists assignment_component_groups_coach_all on public.assignment_component_groups;
create policy assignment_component_groups_coach_all on public.assignment_component_groups
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists assignment_components_select_own on public.assignment_components;
create policy assignment_components_select_own on public.assignment_components
  for select using (client_id = auth.uid());
drop policy if exists assignment_components_coach_all on public.assignment_components;
create policy assignment_components_coach_all on public.assignment_components
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists assignment_responses_select_own on public.assignment_responses;
create policy assignment_responses_select_own on public.assignment_responses
  for select using (client_id = auth.uid());
drop policy if exists assignment_responses_insert_own on public.assignment_responses;
create policy assignment_responses_insert_own on public.assignment_responses
  for insert with check (client_id = auth.uid());
drop policy if exists assignment_responses_update_own on public.assignment_responses;
create policy assignment_responses_update_own on public.assignment_responses
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists assignment_responses_coach_select on public.assignment_responses;
create policy assignment_responses_coach_select on public.assignment_responses
  for select using (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Assignment RPCs -- destination side now, building on 0033_templates.sql's
-- source-side rewrite. Same signatures, same ownership checks.
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
  v_assigned_group_id uuid;
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

  insert into public.assignments (
    client_id, coach_id, type, source_template_id, parent_assignment_id, order_index,
    name, description, photo_path, photo_url, video_path, video_url
  ) values (
    p_client_id, v_coach_id, 'workout', v_workout.id, p_assigned_program_id, p_order_index,
    v_workout.name, v_workout.description,
    v_workout.photo_path, v_workout.photo_url, v_workout.video_path, v_workout.video_url
  ) returning id into v_assigned_workout_id;

  for v_group in
    select * from public.template_component_groups where parent_id = p_workout_id
  loop
    insert into public.assignment_component_groups (
      client_id, coach_id, assignment_id, source_group_id, block_type, rounds, notes
    ) values (
      p_client_id, v_coach_id, v_assigned_workout_id, v_group.id, v_group.block_type, v_group.rounds, v_group.notes
    ) returning id into v_assigned_group_id;

    for r in
      select tc.*, t.name as ex_name, t.instructions as ex_instructions,
             t.photo_path as ex_photo_path, t.photo_url as ex_photo_url,
             t.video_path as ex_video_path, t.video_url as ex_video_url
      from public.template_components tc
      join public.templates t on t.id = tc.child_id
      where tc.group_id = v_group.id
      order by tc.order_index
    loop
      insert into public.assignment_components (
        client_id, coach_id, assignment_id, group_id, source_template_id, order_index,
        name, instructions, photo_path, photo_url, video_path, video_url,
        sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes
      ) values (
        p_client_id, v_coach_id, v_assigned_workout_id, v_assigned_group_id, r.child_id, r.order_index,
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
    insert into public.assignment_components (
      client_id, coach_id, assignment_id, source_template_id, order_index,
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

  insert into public.assignments (
    client_id, coach_id, type, source_template_id, name, description,
    photo_path, photo_url, video_path, video_url
  ) values (
    p_client_id, v_coach_id, 'program', v_program.id, v_program.name, v_program.description,
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

  insert into public.assignments (
    client_id, coach_id, type, source_template_id, document_type, name, description,
    file_path, file_url, form_schema
  ) values (
    p_client_id, v_coach_id, 'document', v_doc.id, v_doc.document_type, v_doc.name, v_doc.description,
    v_doc.file_path, v_doc.file_url, v_doc.form_schema
  ) returning id into v_assigned_id;

  return v_assigned_id;
end;
$$;

grant execute on function public.assign_workout_to_client(uuid, uuid) to authenticated;
grant execute on function public.assign_program_to_client(uuid, uuid) to authenticated;
grant execute on function public.assign_document_to_client(uuid, uuid) to authenticated;
