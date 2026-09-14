-- Assignment snapshots. Assigning a workout/program/document to a client
-- COPIES the current library data (recursively) into these client-owned
-- tables. After assignment, editing the library source never changes what
-- was assigned -- these rows are frozen at insert time and only keep a
-- nullable source_library_*_id for "originally sourced from" provenance
-- display, never re-read live.
--
-- assigned_workouts doubles as both "standalone assigned workout"
-- (assigned_program_id is null) and "workout snapshotted as part of an
-- assigned program" (assigned_program_id set, order_index meaningful) --
-- one shape, one detail view, regardless of how it got assigned. Unlike
-- library_program_workouts, this isn't a many-to-many join: every assigned
-- row is a private copy made for exactly one client, so a nullable parent
-- FK is simpler than a join table here.
--
-- A bare "assign a single exercise" table is intentionally not included --
-- exercises are only ever assigned as part of an assigned workout
-- (assigned_workout_exercises below); add a standalone table later if that
-- ever becomes a real requirement.

-- ---------------------------------------------------------------------------
-- assigned_programs
-- ---------------------------------------------------------------------------
create table if not exists public.assigned_programs (
  id                         uuid primary key default gen_random_uuid(),
  client_id                  uuid not null references public.profiles (id) on delete cascade,
  coach_id                   uuid not null references public.profiles (id) on delete cascade,
  source_library_program_id  uuid references public.library_programs (id) on delete set null,
  name                       text not null,
  description                text,
  photo_path                 text,
  photo_url                  text,
  video_path                 text,
  video_url                  text,
  assigned_at                timestamptz not null default now(),
  created_at                 timestamptz not null default now()
);
create index if not exists assigned_programs_client_id_idx on public.assigned_programs (client_id);
create index if not exists assigned_programs_coach_id_idx on public.assigned_programs (coach_id);

-- ---------------------------------------------------------------------------
-- assigned_workouts
-- ---------------------------------------------------------------------------
create table if not exists public.assigned_workouts (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null references public.profiles (id) on delete cascade,
  coach_id                    uuid not null references public.profiles (id) on delete cascade,
  source_library_workout_id   uuid references public.library_workouts (id) on delete set null,
  assigned_program_id         uuid references public.assigned_programs (id) on delete cascade,
  order_index                 integer, -- position within assigned_program_id; null if standalone
  name                        text not null,
  description                 text,
  photo_path                  text,
  photo_url                   text,
  video_path                  text,
  video_url                   text,
  assigned_at                 timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);
create index if not exists assigned_workouts_client_id_idx on public.assigned_workouts (client_id);
create index if not exists assigned_workouts_coach_id_idx on public.assigned_workouts (coach_id);
create index if not exists assigned_workouts_assigned_program_id_idx on public.assigned_workouts (assigned_program_id);

-- ---------------------------------------------------------------------------
-- assigned_workout_exercises -- flattened snapshot: exercise fields +
-- prescription fields collapsed into one row (no need to keep them split
-- once frozen).
-- ---------------------------------------------------------------------------
create table if not exists public.assigned_workout_exercises (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null references public.profiles (id) on delete cascade,
  coach_id                    uuid not null references public.profiles (id) on delete cascade,
  assigned_workout_id         uuid not null references public.assigned_workouts (id) on delete cascade,
  source_library_exercise_id  uuid references public.library_exercises (id) on delete set null,
  order_index                 integer not null default 0,
  name                        text not null,
  instructions                text,
  photo_path                  text,
  photo_url                   text,
  video_path                  text,
  video_url                   text,
  sets                        integer,
  reps                        text,
  weight_note                 text,
  rest_seconds                integer,
  tempo                       text,
  notes                       text,
  created_at                  timestamptz not null default now()
);
create index if not exists assigned_workout_exercises_client_id_idx on public.assigned_workout_exercises (client_id);
create index if not exists assigned_workout_exercises_assigned_workout_id_idx on public.assigned_workout_exercises (assigned_workout_id);

-- ---------------------------------------------------------------------------
-- assigned_documents
-- ---------------------------------------------------------------------------
create table if not exists public.assigned_documents (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid not null references public.profiles (id) on delete cascade,
  coach_id                    uuid not null references public.profiles (id) on delete cascade,
  source_library_document_id  uuid references public.library_documents (id) on delete set null,
  document_type               text not null check (document_type in ('file', 'form')),
  name                        text not null,
  description                 text,
  file_path                   text,
  file_url                    text,
  form_schema                 jsonb, -- copied verbatim at assignment; later library edits don't change it
  assigned_at                 timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  constraint assigned_documents_type_shape check (
    (document_type = 'form' and form_schema is not null and file_path is null and file_url is null)
    or
    (document_type = 'file' and form_schema is null)
  )
);
create index if not exists assigned_documents_client_id_idx on public.assigned_documents (client_id);
create index if not exists assigned_documents_coach_id_idx on public.assigned_documents (coach_id);

-- ---------------------------------------------------------------------------
-- document_responses -- one evolving response row per assigned form
-- document, upserted by the client as they fill it in. answers is keyed by
-- field id:
--   { [fieldId]: string | number | boolean | string[] | { path, filename } }
-- (a file_upload field's answer stores the uploaded object's path +
-- original filename, not the file itself)
-- ---------------------------------------------------------------------------
create table if not exists public.document_responses (
  id                    uuid primary key default gen_random_uuid(),
  assigned_document_id  uuid not null references public.assigned_documents (id) on delete cascade,
  client_id             uuid not null references public.profiles (id) on delete cascade,
  coach_id              uuid not null references public.profiles (id) on delete cascade,
  answers               jsonb not null default '{}'::jsonb,
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (assigned_document_id)
);
create index if not exists document_responses_client_id_idx on public.document_responses (client_id);
create index if not exists document_responses_coach_id_idx on public.document_responses (coach_id);

-- ---------------------------------------------------------------------------
-- Storage RLS additions now that assigned_* tables exist:
--  - a client can insert/select an object they upload for a file_upload
--    form field, scoped to their own assigned_document
--    ({coach_id}/responses/{assigned_document_id}/...)
--  - a client can select (mint a signed URL for) any media object that's
--    actually referenced by one of their own assigned rows -- checked by
--    literal path equality against the relevant *_path column, not by
--    trusting the coach's path prefix alone, so it's exactly "what was
--    assigned to them", nothing broader from the coach's library.
-- ---------------------------------------------------------------------------
drop policy if exists library_media_client_upload_response on storage.objects;
create policy library_media_client_upload_response on storage.objects
  for insert
  with check (
    bucket_id = 'library-media'
    and (storage.foldername(name))[2] = 'responses'
    and exists (
      select 1 from public.assigned_documents ad
      where ad.id::text = (storage.foldername(name))[3]
        and ad.client_id = auth.uid()
        and ad.coach_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists library_media_client_select_response on storage.objects;
create policy library_media_client_select_response on storage.objects
  for select
  using (
    bucket_id = 'library-media'
    and (storage.foldername(name))[2] = 'responses'
    and exists (
      select 1 from public.assigned_documents ad
      where ad.id::text = (storage.foldername(name))[3]
        and ad.client_id = auth.uid()
    )
  );

drop policy if exists library_media_client_select_assigned on storage.objects;
create policy library_media_client_select_assigned on storage.objects
  for select
  using (
    bucket_id = 'library-media'
    and (
      exists (select 1 from public.assigned_workouts w where w.client_id = auth.uid() and (w.photo_path = name or w.video_path = name))
      or exists (select 1 from public.assigned_workout_exercises e where e.client_id = auth.uid() and (e.photo_path = name or e.video_path = name))
      or exists (select 1 from public.assigned_programs p where p.client_id = auth.uid() and (p.photo_path = name or p.video_path = name))
      or exists (select 1 from public.assigned_documents d where d.client_id = auth.uid() and d.file_path = name)
    )
  );

-- ---------------------------------------------------------------------------
-- RLS on the new tables -- dual ownership, matching 0002's pattern: client
-- reads their own row, coach does everything on rows they own.
-- ---------------------------------------------------------------------------
alter table public.assigned_programs enable row level security;
alter table public.assigned_workouts enable row level security;
alter table public.assigned_workout_exercises enable row level security;
alter table public.assigned_documents enable row level security;
alter table public.document_responses enable row level security;

drop policy if exists assigned_programs_select_own on public.assigned_programs;
create policy assigned_programs_select_own on public.assigned_programs
  for select using (client_id = auth.uid());
drop policy if exists assigned_programs_coach_all on public.assigned_programs;
create policy assigned_programs_coach_all on public.assigned_programs
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists assigned_workouts_select_own on public.assigned_workouts;
create policy assigned_workouts_select_own on public.assigned_workouts
  for select using (client_id = auth.uid());
drop policy if exists assigned_workouts_coach_all on public.assigned_workouts;
create policy assigned_workouts_coach_all on public.assigned_workouts
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists assigned_workout_exercises_select_own on public.assigned_workout_exercises;
create policy assigned_workout_exercises_select_own on public.assigned_workout_exercises
  for select using (client_id = auth.uid());
drop policy if exists assigned_workout_exercises_coach_all on public.assigned_workout_exercises;
create policy assigned_workout_exercises_coach_all on public.assigned_workout_exercises
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists assigned_documents_select_own on public.assigned_documents;
create policy assigned_documents_select_own on public.assigned_documents
  for select using (client_id = auth.uid());
drop policy if exists assigned_documents_coach_all on public.assigned_documents;
create policy assigned_documents_coach_all on public.assigned_documents
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists document_responses_select_own on public.document_responses;
create policy document_responses_select_own on public.document_responses
  for select using (client_id = auth.uid());
drop policy if exists document_responses_insert_own on public.document_responses;
create policy document_responses_insert_own on public.document_responses
  for insert with check (client_id = auth.uid());
drop policy if exists document_responses_update_own on public.document_responses;
create policy document_responses_update_own on public.document_responses
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists document_responses_coach_select on public.document_responses;
create policy document_responses_coach_select on public.document_responses
  for select using (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Assignment RPCs -- run under the CALLING coach's own RLS (no
-- `security definer`, unlike handle_new_user which needs to bypass RLS
-- during signup). That means every select inside is still gated by the
-- coach-owns-it policies from 0004_libraries.sql: if p_workout_id /
-- p_program_id / p_document_id doesn't belong to this coach, the lookup
-- simply returns nothing and the function raises. Doing the whole
-- recursive copy as one function call (rather than a chain of individual
-- Server Action inserts) avoids partial-snapshot writes if a later insert
-- in the chain fails.
-- ---------------------------------------------------------------------------

-- Internal helper shared by assign_workout_to_client and
-- assign_program_to_client -- copies one library workout (and its
-- exercises) into assigned_workouts/assigned_workout_exercises, optionally
-- nested under an assigned_program_id.
create or replace function public._assign_workout_snapshot(
  p_workout_id          uuid,
  p_client_id           uuid,
  p_coach_id            uuid,
  p_assigned_program_id uuid,
  p_order_index         integer
) returns uuid
language plpgsql
as $$
declare
  v_workout public.library_workouts;
  v_assigned_workout_id uuid;
  r record;
begin
  select * into v_workout from public.library_workouts where id = p_workout_id;
  if v_workout.id is null then
    raise exception 'Workout not found or not visible to this coach';
  end if;

  insert into public.assigned_workouts (
    client_id, coach_id, source_library_workout_id, assigned_program_id, order_index,
    name, description, photo_path, photo_url, video_path, video_url
  ) values (
    p_client_id, p_coach_id, v_workout.id, p_assigned_program_id, p_order_index,
    v_workout.name, v_workout.description,
    v_workout.photo_path, v_workout.photo_url, v_workout.video_path, v_workout.video_url
  ) returning id into v_assigned_workout_id;

  for r in
    select lwe.*, le.name as ex_name, le.instructions as ex_instructions,
           le.photo_path as ex_photo_path, le.photo_url as ex_photo_url,
           le.video_path as ex_video_path, le.video_url as ex_video_url
    from public.library_workout_exercises lwe
    join public.library_exercises le on le.id = lwe.exercise_id
    where lwe.workout_id = p_workout_id
    order by lwe.order_index
  loop
    insert into public.assigned_workout_exercises (
      client_id, coach_id, assigned_workout_id, source_library_exercise_id, order_index,
      name, instructions, photo_path, photo_url, video_path, video_url,
      sets, reps, weight_note, rest_seconds, tempo, notes
    ) values (
      p_client_id, p_coach_id, v_assigned_workout_id, r.exercise_id, r.order_index,
      r.ex_name, r.ex_instructions, r.ex_photo_path, r.ex_photo_url, r.ex_video_path, r.ex_video_url,
      r.sets, r.reps, r.weight_note, r.rest_seconds, r.tempo, r.notes
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
declare
  v_coach_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  return public._assign_workout_snapshot(p_workout_id, p_client_id, v_coach_id, null, null);
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
  v_program public.library_programs;
  v_assigned_program_id uuid;
  r record;
begin
  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  select * into v_program from public.library_programs where id = p_program_id;
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
    select * from public.library_program_workouts
    where program_id = p_program_id
    order by order_index
  loop
    perform public._assign_workout_snapshot(
      r.workout_id, p_client_id, v_coach_id, v_assigned_program_id, r.order_index
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
  v_doc public.library_documents;
  v_assigned_id uuid;
begin
  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  select * into v_doc from public.library_documents where id = p_document_id;
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
