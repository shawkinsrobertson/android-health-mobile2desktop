-- Calendar scheduling: give `assignments` an actual date, instead of
-- leaving the calendar able to show only coaching calls.
--
-- Everything schedulable (a workout, a program's nested workouts, a
-- document/form's due date) already lives in `assignments` -- the gap was
-- that nothing on that table said *when*. `template_components.week_
-- number`/`day_of_week` (0033_templates.sql) already lets a coach lay out
-- a program's workouts relative to each other, but that was never carried
-- through to the assignment copy a client actually gets
-- (_assign_workout_snapshot below had no params for either).
--
-- Additive, same posture as every prior pass in this restructure: no
-- rename, no drop. Three scheduling shapes, deliberately different from
-- each other because the underlying things being scheduled are different:
--
-- 1. A program assignment gets `start_date`; each of its nested workout
--    assignments gets `week_number`/`day_of_week` (carried straight from
--    the template) and a `scheduled_date` computed once, at assignment
--    time, as `start_date + (week_number-1)*7 + (day_of_week-1)` days --
--    day_of_week here is relative to start_date's own weekday (start_date
--    itself is "day 1"), not a fixed Monday-start calendar week. No
--    read-time recurrence math is ever needed for a program's workouts.
-- 2. A standalone one-off workout (or a document) just gets a
--    `scheduled_date` set directly.
-- 3. A standalone *recurring* workout gets `recurrence_days_of_week`
--    (1=Monday..7=Sunday, isodow -- the same convention template_
--    components.day_of_week already uses) and an optional `recurrence_
--    end_date` on the original assignment row; `generate_recurring_
--    occurrences` below materializes real, independent, fully completable
--    assignment rows for each missing occurrence in a bounded window
--    (rather than computing virtual occurrences at read time), each
--    tagged with `recurrence_source_id` pointing back at the original --
--    deliberately a different column from `parent_assignment_id`, which
--    already means "nested under this program assignment" and has to
--    keep that one meaning. Moving one occurrence (reschedule_assignment)
--    only ever touches that one row, never the series.
--
-- check_in_templates/check_in_responses need no schema change at all --
-- day_of_week there already supports projecting virtual occurrences at
-- read time cheaply (a client has at most one active weekly cadence), and
-- completion is already a week_start lookup. calendar_events (coaching
-- calls) is untouched.

alter table public.assignments
  add column if not exists scheduled_date date,
  add column if not exists start_date date,
  add column if not exists week_number integer,
  add column if not exists day_of_week integer check (day_of_week between 1 and 7),
  add column if not exists recurrence_days_of_week smallint[],
  add column if not exists recurrence_end_date date,
  add column if not exists recurrence_source_id uuid references public.assignments (id) on delete cascade;

create index if not exists assignments_scheduled_date_idx
  on public.assignments (client_id, scheduled_date)
  where scheduled_date is not null;

create index if not exists assignments_recurrence_source_id_idx
  on public.assignments (recurrence_source_id)
  where recurrence_source_id is not null;

-- ---------------------------------------------------------------------------
-- _assign_workout_snapshot -- add week_number/day_of_week/scheduled_date.
-- Dropped first: adding parameters changes a plpgsql function's identity
-- for CREATE OR REPLACE purposes, so without the drop the original
-- 4-argument version would stay around as an orphaned second overload.
-- ---------------------------------------------------------------------------
drop function if exists public._assign_workout_snapshot(uuid, uuid, uuid, integer);

create function public._assign_workout_snapshot(
  p_workout_id          uuid,
  p_client_id           uuid,
  p_assigned_program_id uuid,
  p_order_index         integer,
  p_week_number         integer default null,
  p_day_of_week         integer default null,
  p_scheduled_date      date default null
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
    name, description, photo_path, photo_url, video_path, video_url,
    week_number, day_of_week, scheduled_date
  ) values (
    p_client_id, v_coach_id, 'workout', v_workout.id, p_assigned_program_id, p_order_index,
    v_workout.name, v_workout.description,
    v_workout.photo_path, v_workout.photo_url, v_workout.video_path, v_workout.video_url,
    p_week_number, p_day_of_week, p_scheduled_date
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

-- ---------------------------------------------------------------------------
-- assign_workout_to_client -- add an optional scheduled_date for a
-- standalone one-off workout.
-- ---------------------------------------------------------------------------
drop function if exists public.assign_workout_to_client(uuid, uuid);

create function public.assign_workout_to_client(
  p_workout_id     uuid,
  p_client_id      uuid,
  p_scheduled_date date default null
) returns uuid
language plpgsql
as $$
begin
  return public._assign_workout_snapshot(p_workout_id, p_client_id, null, null, null, null, p_scheduled_date);
end;
$$;

grant execute on function public.assign_workout_to_client(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_program_to_client -- add a start_date; each nested workout's
-- scheduled_date is computed once here, at assignment time, from the
-- template's own week_number/day_of_week (see this file's header comment
-- for the exact formula and what day_of_week is relative to). A workout
-- with no week_number/day_of_week set on the template (still optional
-- there, per ProgramWorkoutListEditor's "Unscheduled" fallback) carries
-- week_number/day_of_week through as null and gets no scheduled_date --
-- never silently defaulted to week 1 day 1.
-- ---------------------------------------------------------------------------
drop function if exists public.assign_program_to_client(uuid, uuid);

create function public.assign_program_to_client(
  p_program_id uuid,
  p_client_id  uuid,
  p_start_date date default current_date
) returns uuid
language plpgsql
as $$
declare
  v_coach_id uuid := auth.uid();
  v_program public.templates;
  v_assigned_program_id uuid;
  r record;
  v_scheduled_date date;
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
    photo_path, photo_url, video_path, video_url, start_date
  ) values (
    p_client_id, v_coach_id, 'program', v_program.id, v_program.name, v_program.description,
    v_program.photo_path, v_program.photo_url, v_program.video_path, v_program.video_url, p_start_date
  ) returning id into v_assigned_program_id;

  for r in
    select * from public.template_components
    where parent_id = p_program_id
    order by order_index
  loop
    v_scheduled_date := case
      when p_start_date is not null and r.week_number is not null and r.day_of_week is not null
        then p_start_date + ((r.week_number - 1) * 7 + (r.day_of_week - 1))
      else null
    end;
    perform public._assign_workout_snapshot(
      r.child_id, p_client_id, v_assigned_program_id, r.order_index,
      r.week_number, r.day_of_week, v_scheduled_date
    );
  end loop;

  return v_assigned_program_id;
end;
$$;

grant execute on function public.assign_program_to_client(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_document_to_client -- same optional scheduled_date (a due date,
-- here) as assign_workout_to_client above.
-- ---------------------------------------------------------------------------
drop function if exists public.assign_document_to_client(uuid, uuid);

create function public.assign_document_to_client(
  p_document_id    uuid,
  p_client_id      uuid,
  p_scheduled_date date default null
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
    file_path, file_url, form_schema, scheduled_date
  ) values (
    p_client_id, v_coach_id, 'document', v_doc.id, v_doc.document_type, v_doc.name, v_doc.description,
    v_doc.file_path, v_doc.file_url, v_doc.form_schema, p_scheduled_date
  ) returning id into v_assigned_id;

  return v_assigned_id;
end;
$$;

grant execute on function public.assign_document_to_client(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- reschedule_assignment -- the one mutation both the web drag-and-drop and
-- the Android tap-to-pick-a-day call. security definer, deliberately
-- narrower than a blanket client-side UPDATE policy on `assignments`
-- would be: a client can move their own assignment's date through this,
-- never rewrite its name/description/exercises (there is no client UPDATE
-- RLS policy on `assignments` at all -- this function is the only write
-- path a client has onto their own assignment row, on purpose).
-- ---------------------------------------------------------------------------
create function public.reschedule_assignment(
  p_assignment_id uuid,
  p_new_date      date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_coach_id uuid;
begin
  select client_id, coach_id into v_client_id, v_coach_id
    from public.assignments where id = p_assignment_id;

  if v_client_id is null then
    raise exception 'Assignment not found';
  end if;
  if auth.uid() is distinct from v_client_id and auth.uid() is distinct from v_coach_id then
    raise exception 'not authorized';
  end if;

  update public.assignments set scheduled_date = p_new_date where id = p_assignment_id;
end;
$$;

grant execute on function public.reschedule_assignment(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- generate_recurring_occurrences -- lazily materializes real, independent
-- assignment rows (each with its own copy of the exercises, same shape
-- _assign_workout_snapshot produces) for a recurring standalone workout's
-- missing occurrences between today and p_through. Idempotent (skips any
-- date that already has a generated row for this series) and bounded by
-- whatever p_through the caller passes -- callers should pass something
-- like "today + 8 weeks", not an open-ended date, since nothing in this
-- project schedules a recurring background job to call this on its own.
-- security definer for the same reason as reschedule_assignment: a client
-- opening their own calendar first (before their coach ever does) needs
-- to be able to trigger this too, and clients have no INSERT policy on
-- assignments/assignment_components/assignment_component_groups.
-- ---------------------------------------------------------------------------
create function public.generate_recurring_occurrences(
  p_assignment_id uuid,
  p_through       date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.assignments;
  v_date date;
  v_new_id uuid;
  v_group record;
  v_new_group_id uuid;
  r record;
begin
  select * into v_source from public.assignments where id = p_assignment_id;
  if v_source.id is null then
    raise exception 'Assignment not found';
  end if;
  if v_source.recurrence_days_of_week is null then
    raise exception 'Not a recurring assignment';
  end if;
  if auth.uid() is distinct from v_source.client_id and auth.uid() is distinct from v_source.coach_id then
    raise exception 'not authorized';
  end if;

  v_date := current_date;
  while v_date <= least(p_through, coalesce(v_source.recurrence_end_date, p_through)) loop
    if extract(isodow from v_date)::smallint = any(v_source.recurrence_days_of_week)
       and v_date is distinct from v_source.scheduled_date
       and not exists (
         select 1 from public.assignments
         where recurrence_source_id = p_assignment_id and scheduled_date = v_date
       )
    then
      insert into public.assignments (
        client_id, coach_id, type, source_template_id, recurrence_source_id,
        name, description, photo_path, photo_url, video_path, video_url, scheduled_date
      ) values (
        v_source.client_id, v_source.coach_id, 'workout', v_source.source_template_id, p_assignment_id,
        v_source.name, v_source.description,
        v_source.photo_path, v_source.photo_url, v_source.video_path, v_source.video_url, v_date
      ) returning id into v_new_id;

      for v_group in
        select * from public.assignment_component_groups where assignment_id = p_assignment_id
      loop
        insert into public.assignment_component_groups (
          client_id, coach_id, assignment_id, source_group_id, block_type, rounds, notes
        ) values (
          v_source.client_id, v_source.coach_id, v_new_id, v_group.source_group_id, v_group.block_type, v_group.rounds, v_group.notes
        ) returning id into v_new_group_id;

        for r in
          select * from public.assignment_components where group_id = v_group.id order by order_index
        loop
          insert into public.assignment_components (
            client_id, coach_id, assignment_id, group_id, source_template_id, order_index,
            name, instructions, photo_path, photo_url, video_path, video_url,
            sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes
          ) values (
            v_source.client_id, v_source.coach_id, v_new_id, v_new_group_id, r.source_template_id, r.order_index,
            r.name, r.instructions, r.photo_path, r.photo_url, r.video_path, r.video_url,
            r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes
          );
        end loop;
      end loop;

      for r in
        select * from public.assignment_components
        where assignment_id = p_assignment_id and group_id is null
        order by order_index
      loop
        insert into public.assignment_components (
          client_id, coach_id, assignment_id, source_template_id, order_index,
          name, instructions, photo_path, photo_url, video_path, video_url,
          sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes
        ) values (
          v_source.client_id, v_source.coach_id, v_new_id, r.source_template_id, r.order_index,
          r.name, r.instructions, r.photo_path, r.photo_url, r.video_path, r.video_url,
          r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes
        );
      end loop;
    end if;

    v_date := v_date + 1;
  end loop;
end;
$$;

grant execute on function public.generate_recurring_occurrences(uuid, date) to authenticated;
