-- assign_workout_to_client / assign_document_to_client: default
-- p_scheduled_date to current_date instead of null, matching
-- assign_program_to_client's own current_date default (0039).
--
-- 0039 deliberately left these two unscheduled-by-default, reasoning that
-- a coach might want to assign something to a client's library without
-- placing it on a specific day yet. In practice, with the calendar now a
-- first-class place to assign *and* schedule in one step (both the new
-- "+ Assign" calendar entry point and the older plain client-page picker
-- call these same RPCs), that default surprised a coach who assigned a
-- workout and expected it to show up on the calendar immediately --
-- "unscheduled" is a real state, but it should be something a coach
-- opts into (by explicitly clearing the date on the assign form), not
-- the silent default every assignment lands in. Matching the program
-- default removes that asymmetry.
--
-- CREATE OR REPLACE is enough here, unlike 0039's own functions -- only
-- the DEFAULT expression text changes, not the parameter list/types, so
-- this isn't a new function identity and no DROP is needed first.

create or replace function public.assign_workout_to_client(
  p_workout_id     uuid,
  p_client_id      uuid,
  p_scheduled_date date default current_date
) returns uuid
language plpgsql
as $$
begin
  return public._assign_workout_snapshot(p_workout_id, p_client_id, null, null, null, null, p_scheduled_date);
end;
$$;

create or replace function public.assign_document_to_client(
  p_document_id    uuid,
  p_client_id      uuid,
  p_scheduled_date date default current_date
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
