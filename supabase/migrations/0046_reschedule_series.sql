-- Check-in architecture migration, part 1b: "reschedule this occurrence"
-- vs "reschedule this and every future occurrence" -- the other half of
-- Day 5's recurrence extension (0045_check_ins_assignments.sql did the
-- schema/generate_recurring_occurrences half). reschedule_assignment
-- already does "this occurrence only" (a single-row date update, leaving
-- the rest of a series alone) -- extended here with an optional
-- p_apply_to_future flag rather than a parallel function, the same
-- backward-compatible-default-param shape assign_workout_to_client etc.
-- already use for an added capability.
--
-- "This and future" splits the series at the moved occurrence:
--   - If the moved row IS a series' source (recurrence_days_of_week is
--     set directly on it), its own anchor/pattern just moves in place --
--     scheduled_date and recurrence_days_of_week both update to match
--     the new date's weekday.
--   - If the moved row is a *generated* occurrence (recurrence_source_id
--     points at some other row), the old source's pattern is capped
--     with recurrence_end_date so it stops producing anything from here
--     on, and the moved row itself is promoted into a brand new source
--     (recurrence_source_id cleared, recurrence_days_of_week set from
--     the new date's weekday) -- generate_recurring_occurrences then
--     grows the new pattern forward from here, lazily, same as any other
--     series.
-- Either way, any sibling occurrence already materialized beyond this
-- point under the old pattern is deleted (cascading to its own
-- components/response, if any) -- but only if nobody's actually acted on
-- it yet (no submitted response, no completed workout session); an
-- occurrence the client already answered or finished is never touched by
-- a reschedule, regardless of a stale pattern.

drop function if exists public.reschedule_assignment(uuid, date);

create function public.reschedule_assignment(
  p_assignment_id  uuid,
  p_new_date       date,
  p_apply_to_future boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.assignments;
  v_new_day smallint;
begin
  select * into v_row from public.assignments where id = p_assignment_id;
  if v_row.id is null then
    raise exception 'Assignment not found';
  end if;
  if auth.uid() is distinct from v_row.client_id and auth.uid() is distinct from v_row.coach_id then
    raise exception 'not authorized';
  end if;

  if not p_apply_to_future then
    update public.assignments set scheduled_date = p_new_date where id = p_assignment_id;
    return;
  end if;

  v_new_day := extract(isodow from p_new_date)::smallint;

  if v_row.recurrence_days_of_week is not null then
    delete from public.assignments
      where recurrence_source_id = p_assignment_id
        and scheduled_date > v_row.scheduled_date
        and not exists (select 1 from public.assignment_responses ar where ar.assignment_id = assignments.id and ar.submitted_at is not null)
        and not exists (select 1 from public.workout_sessions ws where ws.assigned_workout_id = assignments.id and ws.completed_at is not null);

    update public.assignments
      set scheduled_date = p_new_date, recurrence_days_of_week = array[v_new_day]
      where id = p_assignment_id;
  elsif v_row.recurrence_source_id is not null then
    update public.assignments
      set recurrence_end_date = v_row.scheduled_date - 1
      where id = v_row.recurrence_source_id;

    delete from public.assignments
      where recurrence_source_id = v_row.recurrence_source_id
        and id <> p_assignment_id
        and scheduled_date > v_row.scheduled_date
        and not exists (select 1 from public.assignment_responses ar where ar.assignment_id = assignments.id and ar.submitted_at is not null)
        and not exists (select 1 from public.workout_sessions ws where ws.assigned_workout_id = assignments.id and ws.completed_at is not null);

    update public.assignments
      set scheduled_date = p_new_date,
          recurrence_days_of_week = array[v_new_day],
          recurrence_source_id = null,
          recurrence_end_date = null
      where id = p_assignment_id;
  else
    -- Not part of any recurring series -- "this and future" has nothing
    -- else to apply to, so it's just the single-row move.
    update public.assignments set scheduled_date = p_new_date where id = p_assignment_id;
  end if;
end;
$$;

grant execute on function public.reschedule_assignment(uuid, date, boolean) to authenticated;
