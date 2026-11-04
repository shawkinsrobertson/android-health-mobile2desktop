-- Check-in architecture migration, part 2: data migration. Converts
-- every existing check_in_templates/check_in_responses row into the new
-- templates/assignments/assignment_responses shape from
-- 0045_check_ins_assignments.sql, preserving every row's original id
-- (same posture as 0033/0034's own backfills) and every response's
-- answers/submitted_at exactly.
--
-- Per check_in_templates row:
--   - One templates row (id preserved), type='check_in'.
--   - One "source" assignments row carrying the recurrence pattern
--     (day_of_week converted from the old 0=Sunday..6=Saturday
--     convention to isodow 1=Monday..7=Sunday) -- anchored at the
--     EARLIEST existing check_in_responses.week_start if any response
--     ever existed, so that row doubles as that occurrence (same "source
--     row IS one real occurrence" convention a recurring workout already
--     uses), or at the next upcoming matching weekday if the template
--     was never answered even once.
--   - Every OTHER check_in_responses row (other than the one that
--     anchors the source) becomes its own child assignments row, dated
--     at that response's own week_start, with recurrence_source_id
--     pointing at the source -- exactly what generate_recurring_
--     occurrences would have produced had this series existed under the
--     new model the whole time.
--   - Every migrated response keeps its own original check_in_responses
--     id as its new assignment_responses id, including an unsubmitted
--     (submitted_at null) draft -- nothing is dropped or reinterpreted.
--   - recurrence_end_date is left null (open-ended) for a template that
--     was still `active`; for one a coach had already turned off, it's
--     capped at the latest existing response's week (or yesterday, if
--     there's no history at all) so generate_recurring_occurrences never
--     manufactures new weeks for a check-in nobody is using anymore.
--
-- Per-template idempotent: skips a check_in_templates row entirely if an
-- assignments row already points at it (source_template_id + type), so
-- re-running this file after a partial failure never double-migrates.
-- Old tables are untouched -- dropped only once the app cutover is
-- verified (part 4).

do $$
declare
  v_template record;
  v_isodow smallint;
  v_source_id uuid;
  v_anchor_week date;
  v_latest_week date;
  v_next_date date;
  v_recurrence_end date;
  v_response record;
  v_child_id uuid;
begin
  for v_template in select * from public.check_in_templates loop
    if exists (
      select 1 from public.assignments
      where source_template_id = v_template.id and type = 'check_in'
    ) then
      continue;
    end if;

    insert into public.templates (id, coach_id, type, status, name, form_schema, created_at, updated_at)
    values (v_template.id, v_template.coach_id, 'check_in', 'published', v_template.name, v_template.form_schema, v_template.created_at, v_template.updated_at)
    on conflict (id) do nothing;

    -- 0=Sunday..6=Saturday (check_in_templates' own convention) -> isodow 1=Monday..7=Sunday.
    v_isodow := case when v_template.day_of_week = 0 then 7 else v_template.day_of_week end;

    select min(week_start), max(week_start) into v_anchor_week, v_latest_week
      from public.check_in_responses where template_id = v_template.id;

    if v_anchor_week is null then
      if v_template.active then
        -- Never answered, but still live -- anchor at the next upcoming
        -- occurrence, same as a freshly-assigned check-in would be.
        v_next_date := current_date;
        while extract(isodow from v_next_date)::smallint <> v_isodow loop
          v_next_date := v_next_date + 1;
        end loop;
        v_anchor_week := v_next_date;
      else
        -- Retired AND never answered even once -- there is no real
        -- occurrence to anchor on, and projecting one into the future
        -- would show a phantom upcoming item for a dead check-in.
        -- Anchor on its own creation date instead (whatever weekday
        -- that happens to be -- harmless, since a source row's own
        -- scheduled_date never needs to match its own weekday pattern,
        -- see generate_recurring_occurrences' "already accounted for"
        -- skip check).
        v_anchor_week := v_template.created_at::date;
      end if;
    end if;

    v_recurrence_end := case
      when v_template.active then null
      when v_latest_week is not null then v_latest_week
      else v_anchor_week
    end;

    insert into public.assignments (
      client_id, coach_id, type, source_template_id, name, form_schema,
      recurrence_days_of_week, recurrence_end_date, scheduled_date,
      assigned_at, created_at
    ) values (
      v_template.client_id, v_template.coach_id, 'check_in', v_template.id, v_template.name, v_template.form_schema,
      array[v_isodow]::smallint[], v_recurrence_end, v_anchor_week,
      v_template.created_at, v_template.created_at
    ) returning id into v_source_id;

    if v_latest_week is not null then
      for v_response in
        select * from public.check_in_responses
        where template_id = v_template.id
        order by week_start
      loop
        if v_response.week_start = v_anchor_week then
          insert into public.assignment_responses (id, assignment_id, client_id, coach_id, answers, submitted_at, created_at, updated_at)
          values (v_response.id, v_source_id, v_response.client_id, v_response.coach_id, v_response.answers, v_response.submitted_at, v_response.created_at, v_response.updated_at)
          on conflict (id) do nothing;
        else
          insert into public.assignments (
            client_id, coach_id, type, source_template_id, recurrence_source_id, name, form_schema, scheduled_date, assigned_at, created_at
          ) values (
            v_template.client_id, v_template.coach_id, 'check_in', v_template.id, v_source_id, v_template.name, v_template.form_schema, v_response.week_start, v_response.created_at, v_response.created_at
          ) returning id into v_child_id;

          insert into public.assignment_responses (id, assignment_id, client_id, coach_id, answers, submitted_at, created_at, updated_at)
          values (v_response.id, v_child_id, v_response.client_id, v_response.coach_id, v_response.answers, v_response.submitted_at, v_response.created_at, v_response.updated_at)
          on conflict (id) do nothing;
        end if;
      end loop;
    end if;
  end loop;
end;
$$;
