-- Timed exercises, supersets, and circuits.
--
-- A "block" groups 2+ of a workout's exercise rows to be performed
-- together: a superset (back-to-back, no rest between members -- only the
-- last member's rest_seconds is meaningful, as the rest before the next
-- round) or a circuit (a series of exercises, each with its own rest
-- before the next one, where the LAST member's rest_seconds conventionally
-- doubles as the rest between rounds rather than a separate field -- this
-- matches how coaches actually write these up, so there's no extra
-- "rest between rounds" column).
--
-- library_workout_exercises.block_id is nullable and purely additive: an
-- ungrouped (standalone) exercise has block_id = null and behaves exactly
-- as before. order_index stays a single flat sequence across the whole
-- workout regardless of grouping -- a block's position is wherever its
-- members' (shared, contiguous-by-convention but not enforced) order_index
-- values fall; the app groups by block_id when rendering, it's not a
-- second ordering dimension in the schema.
--
-- "Rounds" (how many times the group repeats) lives on the block, not
-- per-member sets -- all members of a synced circuit/superset round go
-- together, so per-exercise "sets" wouldn't make sense here (and stays
-- meaningless/unused on grouped member rows; still used normally on
-- standalone rows).

create table if not exists public.library_workout_blocks (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles (id) on delete cascade,
  workout_id  uuid not null references public.library_workouts (id) on delete cascade,
  block_type  text not null check (block_type in ('superset', 'circuit')),
  rounds      integer not null default 1,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists library_workout_blocks_workout_id_idx on public.library_workout_blocks (workout_id);

alter table public.library_workout_exercises
  add column if not exists block_id uuid references public.library_workout_blocks (id) on delete cascade,
  add column if not exists prescription_type text not null default 'reps' check (prescription_type in ('reps', 'time')),
  add column if not exists duration_seconds integer;
create index if not exists library_workout_exercises_block_id_idx on public.library_workout_exercises (block_id);

alter table public.library_workout_blocks enable row level security;
drop policy if exists library_workout_blocks_coach_all on public.library_workout_blocks;
create policy library_workout_blocks_coach_all on public.library_workout_blocks
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Mirror the same grouping onto the assigned (snapshot) side, so an
-- assigned workout still shows "Superset" / "Circuit -- 3 rounds" rather
-- than losing that structure when it's copied at assignment time.
-- ---------------------------------------------------------------------------
create table if not exists public.assigned_workout_blocks (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.profiles (id) on delete cascade,
  coach_id             uuid not null references public.profiles (id) on delete cascade,
  assigned_workout_id  uuid not null references public.assigned_workouts (id) on delete cascade,
  source_block_id      uuid references public.library_workout_blocks (id) on delete set null,
  block_type           text not null check (block_type in ('superset', 'circuit')),
  rounds               integer not null default 1,
  notes                text,
  created_at           timestamptz not null default now()
);
create index if not exists assigned_workout_blocks_assigned_workout_id_idx on public.assigned_workout_blocks (assigned_workout_id);

alter table public.assigned_workout_exercises
  add column if not exists block_id uuid references public.assigned_workout_blocks (id) on delete cascade,
  add column if not exists prescription_type text not null default 'reps' check (prescription_type in ('reps', 'time')),
  add column if not exists duration_seconds integer;
create index if not exists assigned_workout_exercises_block_id_idx on public.assigned_workout_exercises (block_id);

alter table public.assigned_workout_blocks enable row level security;
drop policy if exists assigned_workout_blocks_select_own on public.assigned_workout_blocks;
create policy assigned_workout_blocks_select_own on public.assigned_workout_blocks
  for select using (client_id = auth.uid());
drop policy if exists assigned_workout_blocks_coach_all on public.assigned_workout_blocks;
create policy assigned_workout_blocks_coach_all on public.assigned_workout_blocks
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Rewrite _assign_workout_snapshot (see 0007_assignment_rpc_ownership_fix.sql
-- for its current signature/ownership-check shape, unchanged here) to also
-- copy each library_workout_blocks row into assigned_workout_blocks, and
-- to carry prescription_type/duration_seconds through on every exercise
-- row -- grouped or standalone.
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
  v_workout public.library_workouts;
  v_assigned_workout_id uuid;
  v_block record;
  v_assigned_block_id uuid;
  r record;
begin
  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  select * into v_workout from public.library_workouts where id = p_workout_id;
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

  -- Grouped exercises: one pass per block, so each block's members land
  -- under a freshly-created assigned_workout_blocks row.
  for v_block in
    select * from public.library_workout_blocks where workout_id = p_workout_id
  loop
    insert into public.assigned_workout_blocks (
      client_id, coach_id, assigned_workout_id, source_block_id, block_type, rounds, notes
    ) values (
      p_client_id, v_coach_id, v_assigned_workout_id, v_block.id, v_block.block_type, v_block.rounds, v_block.notes
    ) returning id into v_assigned_block_id;

    for r in
      select lwe.*, le.name as ex_name, le.instructions as ex_instructions,
             le.photo_path as ex_photo_path, le.photo_url as ex_photo_url,
             le.video_path as ex_video_path, le.video_url as ex_video_url
      from public.library_workout_exercises lwe
      join public.library_exercises le on le.id = lwe.exercise_id
      where lwe.block_id = v_block.id
      order by lwe.order_index
    loop
      insert into public.assigned_workout_exercises (
        client_id, coach_id, assigned_workout_id, block_id, source_library_exercise_id, order_index,
        name, instructions, photo_path, photo_url, video_path, video_url,
        sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes
      ) values (
        p_client_id, v_coach_id, v_assigned_workout_id, v_assigned_block_id, r.exercise_id, r.order_index,
        r.ex_name, r.ex_instructions, r.ex_photo_path, r.ex_photo_url, r.ex_video_path, r.ex_video_url,
        r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes
      );
    end loop;
  end loop;

  -- Standalone exercises: same as before, just with block_id left null
  -- and prescription_type/duration_seconds carried through.
  for r in
    select lwe.*, le.name as ex_name, le.instructions as ex_instructions,
           le.photo_path as ex_photo_path, le.photo_url as ex_photo_url,
           le.video_path as ex_video_path, le.video_url as ex_video_url
    from public.library_workout_exercises lwe
    join public.library_exercises le on le.id = lwe.exercise_id
    where lwe.workout_id = p_workout_id and lwe.block_id is null
    order by lwe.order_index
  loop
    insert into public.assigned_workout_exercises (
      client_id, coach_id, assigned_workout_id, source_library_exercise_id, order_index,
      name, instructions, photo_path, photo_url, video_path, video_url,
      sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes
    ) values (
      p_client_id, v_coach_id, v_assigned_workout_id, r.exercise_id, r.order_index,
      r.ex_name, r.ex_instructions, r.ex_photo_path, r.ex_photo_url, r.ex_video_path, r.ex_video_url,
      r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes
    );
  end loop;

  return v_assigned_workout_id;
end;
$$;
