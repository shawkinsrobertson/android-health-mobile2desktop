import type { SupabaseClient } from "@supabase/supabase-js";
import { listEvents, type CalendarEventRow, type DateRange } from "./calendar";
import { getClientTimezone, localDateKey } from "./queries";

// One calendar day as an abstract "YYYY-MM-DD" step, with no timezone of
// its own -- `from`/`to` are themselves already resolved to the client's
// local calendar dates (via localDateKey below) before this is used, so
// this just walks whole days between two date keys.
function* eachDateKey(fromKey: string, toKey: string): Generator<string> {
  let cursor = new Date(`${fromKey}T00:00:00Z`);
  const end = new Date(`${toKey}T00:00:00Z`);
  while (cursor < end) {
    yield cursor.toISOString().slice(0, 10);
    cursor = new Date(cursor.getTime() + 24 * 3_600_000);
  }
}

export type CalendarItemKind = "call" | "workout" | "document" | "check_in";

// One shared shape CalendarViews.tsx's grid/list components render,
// whatever kind of thing is actually scheduled on a given day. `date` is
// the single source of truth for which day cell an item belongs in --
// calendar_events has a real start_time to derive it from, but a workout/
// document/check-in only ever has a day, not a time, so those don't get a
// synthetic time-of-day invented for them (startTime/endTime stay null,
// allDay stays true).
//
// Deliberately only ever populated for a client-scoped calendar (the
// "shared... between coach and client" calendar the user asked for), not
// the coach's own aggregate `/dashboard/calendar` workspace across every
// client -- see listCalendarItems below.
export interface CalendarItem {
  kind: CalendarItemKind;
  id: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  hasVideoCall: boolean;
  completed: boolean;
  // Set for kind 'workout'/'document' -- what reschedule_assignment and
  // the click-to-edit/complete actions operate on.
  assignmentId: string | null;
  // Set for kind 'check_in' -- a virtual occurrence, never its own row
  // until a client actually submits it (see check_in_templates.day_of_week
  // / lib/check-ins.ts's currentWeekStart, which this mirrors).
  checkIn: { templateId: string; weekStart: string } | null;
  // Set for kind 'call' -- the original row, for EventModal/Join.
  event: CalendarEventRow | null;
}

export function eventToItem(ev: CalendarEventRow): CalendarItem {
  return {
    kind: "call",
    id: ev.id,
    title: ev.title,
    date: ev.start_time.slice(0, 10),
    startTime: ev.start_time,
    endTime: ev.end_time,
    allDay: ev.all_day,
    hasVideoCall: ev.has_video_call,
    completed: false,
    assignmentId: null,
    checkIn: null,
    event: ev,
  };
}

interface ScheduledAssignmentRow {
  id: string;
  type: "workout" | "document";
  name: string;
  scheduled_date: string;
}

async function listScheduledAssignments(
  supabase: SupabaseClient,
  clientId: string,
  startKey: string,
  endKey: string,
): Promise<CalendarItem[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("id, type, name, scheduled_date")
    .eq("client_id", clientId)
    .in("type", ["workout", "document"])
    .gte("scheduled_date", startKey)
    .lt("scheduled_date", endKey);

  if (error) throw new Error(`Failed to load scheduled assignments: ${error.message}`);
  const rows = (data ?? []) as ScheduledAssignmentRow[];
  if (rows.length === 0) return [];

  const workoutIds = rows.filter((r) => r.type === "workout").map((r) => r.id);
  const documentIds = rows.filter((r) => r.type === "document").map((r) => r.id);

  const [sessionRows, responseRows] = await Promise.all([
    workoutIds.length
      ? supabase
          .from("workout_sessions")
          .select("assigned_workout_id")
          .in("assigned_workout_id", workoutIds)
          .not("completed_at", "is", null)
      : Promise.resolve({ data: [] as { assigned_workout_id: string }[] }),
    documentIds.length
      ? supabase
          .from("assignment_responses")
          .select("assignment_id")
          .in("assignment_id", documentIds)
          .not("submitted_at", "is", null)
      : Promise.resolve({ data: [] as { assignment_id: string }[] }),
  ]);

  const completedWorkoutIds = new Set((sessionRows.data ?? []).map((r) => r.assigned_workout_id));
  const completedDocumentIds = new Set((responseRows.data ?? []).map((r) => r.assignment_id));

  return rows.map((r) => ({
    kind: r.type,
    id: r.id,
    title: r.name,
    date: r.scheduled_date,
    startTime: null,
    endTime: null,
    allDay: true,
    hasVideoCall: false,
    completed: r.type === "workout" ? completedWorkoutIds.has(r.id) : completedDocumentIds.has(r.id),
    assignmentId: r.id,
    checkIn: null,
    event: null,
  }));
}

// Projects virtual check-in occurrences for the visible range -- never
// materialized as their own row until a client actually submits one (see
// lib/check-ins.ts's currentWeekStart, which this mirrors: week_start IS
// the occurrence date itself, 0=Sunday..6=Saturday in UTC, matching
// check_in_templates.day_of_week).
async function listCheckInOccurrences(
  supabase: SupabaseClient,
  clientId: string,
  startKey: string,
  endKey: string,
): Promise<CalendarItem[]> {
  const { data: template } = await supabase
    .from("check_in_templates")
    .select("id, name, day_of_week")
    .eq("client_id", clientId)
    .eq("active", true)
    .maybeSingle();

  if (!template) return [];

  // Each date key is already an abstract calendar date (not an instant),
  // so its day-of-week is unambiguous -- read via a UTC-anchored Date
  // purely as a weekday calculator, matching lib/check-ins.ts's own
  // 0=Sunday..6=Saturday convention.
  const occurrences = [...eachDateKey(startKey, endKey)].filter(
    (key) => new Date(`${key}T00:00:00Z`).getUTCDay() === template.day_of_week,
  );
  if (occurrences.length === 0) return [];

  const { data: responses } = await supabase
    .from("check_in_responses")
    .select("week_start, submitted_at")
    .eq("template_id", template.id)
    .in("week_start", occurrences);

  const submittedWeeks = new Set((responses ?? []).filter((r) => r.submitted_at).map((r) => r.week_start));

  return occurrences.map((date) => ({
    kind: "check_in" as const,
    id: `check_in:${template.id}:${date}`,
    title: template.name,
    date,
    startTime: null,
    endTime: null,
    allDay: true,
    hasVideoCall: false,
    completed: submittedWeeks.has(date),
    assignmentId: null,
    checkIn: { templateId: template.id, weekStart: date },
    event: null,
  }));
}

// The merged "everything schedulable" view CalendarCard renders when
// scoped to one client (a client's own dashboard, or a coach's per-client
// page) -- calls, workouts/documents on their scheduled_date, and
// check-in occurrences, together. The coach's own aggregate
// `/dashboard/calendar` workspace (scoped by coachId across every client)
// deliberately stays calls-only -- see this file's CalendarItem doc
// comment for why.
export async function listCalendarItems(
  supabase: SupabaseClient,
  scope: { coachId: string } | { clientId: string },
  range: DateRange,
): Promise<CalendarItem[]> {
  const callItems = (await listEvents(supabase, scope, range)).map(eventToItem);
  if (!("clientId" in scope)) return callItems;

  // scheduled_date/check-in occurrences are plain calendar dates, not
  // instants -- range.start/end (UTC instants the browser's own
  // rangeForView derived from its local "today") need resolving back to
  // the client's local calendar-date boundaries first, the same
  // timezone-correction lib/queries.ts's day-bucketing already relies on,
  // rather than naively slicing the UTC ISO strings (which would be off
  // by a day for any client east of UTC).
  const timeZone = await getClientTimezone(supabase, scope.clientId);
  const startKey = localDateKey(new Date(range.start), timeZone);
  const endKey = localDateKey(new Date(range.end), timeZone);

  const [assignmentItems, checkInItems] = await Promise.all([
    listScheduledAssignments(supabase, scope.clientId, startKey, endKey),
    listCheckInOccurrences(supabase, scope.clientId, startKey, endKey),
  ]);

  return [...callItems, ...assignmentItems, ...checkInItems];
}
