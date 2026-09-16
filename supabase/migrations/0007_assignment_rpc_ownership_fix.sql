-- Close an authorization gap in the assignment RPCs from 0005_assigned.sql.
--
-- _assign_workout_snapshot took p_coach_id as a caller-supplied argument
-- instead of deriving it from auth.uid(), and did no client-ownership
-- check of its own -- it relied entirely on its two callers
-- (assign_workout_to_client / assign_program_to_client) having already
-- verified "is this actually your client" before calling it.
--
-- But _assign_workout_snapshot is itself an ordinary public.-schema
-- function, callable directly via PostgREST RPC exactly like the
-- functions meant to be called that way. Nothing stopped a coach from
-- calling it directly with their own real auth.uid() as p_coach_id (which
-- passes assigned_workouts' `coach_id = auth.uid()` RLS check just fine)
-- but an ARBITRARY p_client_id belonging to a different coach's client
-- (RLS on assigned_workouts never validates client_id, only coach_id) --
-- letting a coach inject assigned content into a client they don't
-- actually coach.
--
-- Fix: _assign_workout_snapshot no longer accepts p_coach_id at all --
-- it derives the coach from auth.uid() internally, same as every other
-- function here, and does its own client-ownership check, so the check
-- holds regardless of whether it's reached through a wrapper or called
-- directly. (assign_document_to_client has no such gap -- it's the only
-- entry point for document assignment and already checks ownership
-- inline before its insert, so it's untouched here.)

drop function if exists public._assign_workout_snapshot(uuid, uuid, uuid, uuid, integer);

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
      p_client_id, v_coach_id, v_assigned_workout_id, r.exercise_id, r.order_index,
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
      r.workout_id, p_client_id, v_assigned_program_id, r.order_index
    );
  end loop;

  return v_assigned_program_id;
end;
$$;

-- Defensive, not fixing a known failure: default Postgres/Supabase
-- privileges already grant EXECUTE on new functions to PUBLIC, so these
-- should be callable without this -- but stating it explicitly removes
-- any doubt for a coach's very first "Assign" click.
grant execute on function public.assign_workout_to_client(uuid, uuid) to authenticated;
grant execute on function public.assign_program_to_client(uuid, uuid) to authenticated;
grant execute on function public.assign_document_to_client(uuid, uuid) to authenticated;
