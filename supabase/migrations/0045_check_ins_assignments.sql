-- Check-in architecture migration, part 1: schema. Moves check-ins off
-- their own parallel check_in_templates/check_in_responses tables
-- (0023_check_ins.sql) onto templates/assignments -- created like a
-- document, assigned like a workout -- so they inherit calendar
-- drag-and-drop, click-to-edit, and reschedule for free. Old tables are
-- left in place and untouched here; the data migration (part 2) and the
-- app cutover happen before they're dropped (part 4, mirroring
-- 0037_drop_legacy_tables.sql's own later cleanup pass for templates).
--
-- 'check_in' joins 'exercise'/'workout'/'program'/'document' as a new
-- templates.type / assignments.type value, reusing form_schema the same
-- way a 'document' row with document_type='form' does -- a check-in is
-- always form-shaped, never a file, so document_type stays null on these
-- rows (it's a document-only column) and a parallel *_check_in_shape
-- constraint enforces form_schema directly instead.
--
-- The recurrence columns a check-in needs (recurrence_days_of_week/
-- recurrence_end_date/recurrence_source_id, scheduled_date) already
-- exist on assignments (0039_assignment_scheduling.sql) -- built for a
-- recurring standalone workout, but nothing about that mechanism is
-- workout-specific except generate_recurring_occurrences' own body,
-- which (a) hardcoded type='workout' on every row it inserts and (b)
-- never copied document_type/file_path/file_url/form_schema onto a
-- generated occurrence. Both of those are genuine pre-existing gaps, not
-- check-in-specific ones: a recurring *document* assignment was already
-- possible to create (assignments.recurrence_days_of_week has no type
-- restriction) but would have silently generated future occurrences with
-- no form_schema at all, and as the wrong type. Fixed here for both.

alter table public.templates
  drop constraint templates_type_check,
  add constraint templates_type_check
    check (type in ('exercise', 'workout', 'program', 'document', 'check_in')),
  add constraint templates_check_in_shape
    check (type <> 'check_in' or form_schema is not null);

alter table public.assignments
  drop constraint assignments_type_check,
  add constraint assignments_type_check
    check (type in ('workout', 'program', 'document', 'check_in')),
  add constraint assignments_check_in_shape
    check (type <> 'check_in' or form_schema is not null);

-- ---------------------------------------------------------------------------
-- generate_recurring_occurrences -- generalized to the source row's own
-- type and document-shaped columns, instead of hardcoding 'workout' and
-- omitting document_type/file_path/file_url/form_schema. The exercise-
-- cloning loops below are unchanged and harmlessly find zero rows for a
-- document/check_in source (nothing to clone), so they're left as plain
-- loops rather than gated behind an `if v_source.type = 'workout'` --
-- same "let the query just return nothing" posture the rest of this
-- project's RPCs already use (e.g. _assign_workout_snapshot's block vs.
-- no-block loops).
-- ---------------------------------------------------------------------------
create or replace function public.generate_recurring_occurrences(
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
        name, description, photo_path, photo_url, video_path, video_url,
        document_type, file_path, file_url, form_schema, scheduled_date
      ) values (
        v_source.client_id, v_source.coach_id, v_source.type, v_source.source_template_id, p_assignment_id,
        v_source.name, v_source.description,
        v_source.photo_path, v_source.photo_url, v_source.video_path, v_source.video_url,
        v_source.document_type, v_source.file_path, v_source.file_url, v_source.form_schema, v_date
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
            sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes, equipment
          ) values (
            v_source.client_id, v_source.coach_id, v_new_id, v_new_group_id, r.source_template_id, r.order_index,
            r.name, r.instructions, r.photo_path, r.photo_url, r.video_path, r.video_url,
            r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes, r.equipment
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
          sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes, equipment
        ) values (
          v_source.client_id, v_source.coach_id, v_new_id, r.source_template_id, r.order_index,
          r.name, r.instructions, r.photo_path, r.photo_url, r.video_path, r.video_url,
          r.sets, r.reps, r.prescription_type, r.duration_seconds, r.weight_note, r.rest_seconds, r.tempo, r.notes, r.equipment
        );
      end loop;
    end if;

    v_date := v_date + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- assign_check_in_to_client -- the one-time "start this client on a
-- recurring check-in" call, mirroring assign_document_to_client's shape
-- but taking a recurrence pattern instead of a single scheduled_date
-- (nothing about a check-in is ever a one-off). Computes the first
-- occurrence date itself (earliest date on/after p_start_date matching
-- one of p_recurrence_days_of_week) so that row doubles as week one's
-- occurrence, exactly the same "source row IS the first occurrence"
-- convention a recurring workout already uses -- generate_recurring_
-- occurrences fills in every week after that, lazily, same as today.
-- ---------------------------------------------------------------------------
create or replace function public.assign_check_in_to_client(
  p_check_in_id            uuid,
  p_client_id              uuid,
  p_recurrence_days_of_week smallint[],
  p_start_date             date default current_date,
  p_recurrence_end_date    date default null
) returns uuid
language plpgsql
as $$
declare
  v_coach_id uuid := auth.uid();
  v_check_in public.templates;
  v_first_date date;
  v_assigned_id uuid;
begin
  if p_recurrence_days_of_week is null or array_length(p_recurrence_days_of_week, 1) is null then
    raise exception 'At least one day of week is required';
  end if;

  if not exists (
    select 1 from public.client_profiles
    where profile_id = p_client_id and coach_id = v_coach_id
  ) then
    raise exception 'Not your client';
  end if;

  select * into v_check_in from public.templates where id = p_check_in_id and type = 'check_in';
  if v_check_in.id is null then
    raise exception 'Check-in not found or not visible to this coach';
  end if;

  v_first_date := p_start_date;
  while not (extract(isodow from v_first_date)::smallint = any(p_recurrence_days_of_week)) loop
    v_first_date := v_first_date + 1;
  end loop;

  insert into public.assignments (
    client_id, coach_id, type, source_template_id, name, description, form_schema,
    recurrence_days_of_week, recurrence_end_date, scheduled_date
  ) values (
    p_client_id, v_coach_id, 'check_in', v_check_in.id, v_check_in.name, v_check_in.description, v_check_in.form_schema,
    p_recurrence_days_of_week, p_recurrence_end_date, v_first_date
  ) returning id into v_assigned_id;

  return v_assigned_id;
end;
$$;

grant execute on function public.assign_check_in_to_client(uuid, uuid, smallint[], date, date) to authenticated;
