-- Fix: calendar_events' insert policy (0016_calendar_events.sql)
-- required created_by = auth.uid() unconditionally, which blocks the
-- Google Calendar sync action (pass 2, lib/calendar-sync-actions.ts)
-- from inserting synced-in events -- those aren't authored by anyone
-- in-app, so created_by is intentionally null for them (see
-- 0016_calendar_events.sql's own comment on that column). Relax the
-- check to accept either a real author or an explicitly-null one,
-- matching created_by's actual meaning ("who authored this event
-- in-app," not "who caused this row to exist at all"). The public
-- booking page's inserts (pass 3) go through a security-definer
-- function instead of this policy either way, so they're unaffected.

drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events
  for insert with check (
    (created_by = auth.uid() or created_by is null)
    and (coach_id = auth.uid() or client_id = auth.uid())
  );
