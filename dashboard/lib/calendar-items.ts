import type { SupabaseClient } from "@supabase/supabase-js";
import { listEvents, type CalendarEventRow, type DateRange } from "./calendar";
import { getClientTimezone, localDateKey } from "./queries";

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
  // Set for kind 'workout'/'document'/'check_in' -- what
  // reschedule_assignment and the click-to-edit/complete actions operate
  // on. A check-in occurrence is a real assignment row now (see
  // 0045_check_ins_assignments.sql), not a projected virtual date, so it
  // carries this exactly like a workout/document does.
  assignmentId: string | null;
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
    event: ev,
  };
}

interface ScheduledAssignmentRow {
  id: string;
  type: "workout" | "document" | "check_in";
  name: string;
  scheduled_date: string;
}

// Recurring series (recurrence_days_of_week set -- only ever true on a
// series' own source row, never a generated occurrence) only ever grow
// new rows forward from "today" when generate_recurring_occurrences is
// actually called -- nothing in this app calls it on a schedule, so it
// has to happen lazily here, right before reading the range a calendar
// view asks for. Harmless to call for an already-ended series (its own
// while loop is then immediately a no-op) or for a past date range
// (p_through < today also makes it a no-op) -- see that function's body.
async function ensureRecurringOccurrences(
  supabase: SupabaseClient,
  clientId: string,
  throughKey: string,
): Promise<void> {
  const { data: sources } = await supabase
    .from("assignments")
    .select("id")
    .eq("client_id", clientId)
    .not("recurrence_days_of_week", "is", null);

  await Promise.all(
    (sources ?? []).map((s) =>
      supabase.rpc("generate_recurring_occurrences", { p_assignment_id: s.id, p_through: throughKey }),
    ),
  );
}

async function listScheduledAssignments(
  supabase: SupabaseClient,
  clientId: string,
  startKey: string,
  endKey: string,
): Promise<CalendarItem[]> {
  await ensureRecurringOccurrences(supabase, clientId, endKey);

  const { data, error } = await supabase
    .from("assignments")
    .select("id, type, name, scheduled_date")
    .eq("client_id", clientId)
    .in("type", ["workout", "document", "check_in"])
    .gte("scheduled_date", startKey)
    .lt("scheduled_date", endKey);

  if (error) throw new Error(`Failed to load scheduled assignments: ${error.message}`);
  const rows = (data ?? []) as ScheduledAssignmentRow[];
  if (rows.length === 0) return [];

  const workoutIds = rows.filter((r) => r.type === "workout").map((r) => r.id);
  // Documents and check-ins both complete the same way -- an
  // assignment_responses row with submitted_at set.
  const formIds = rows.filter((r) => r.type === "document" || r.type === "check_in").map((r) => r.id);

  const [sessionRows, responseRows] = await Promise.all([
    workoutIds.length
      ? supabase
          .from("workout_sessions")
          .select("assigned_workout_id")
          .in("assigned_workout_id", workoutIds)
          .not("completed_at", "is", null)
      : Promise.resolve({ data: [] as { assigned_workout_id: string }[] }),
    formIds.length
      ? supabase
          .from("assignment_responses")
          .select("assignment_id")
          .in("assignment_id", formIds)
          .not("submitted_at", "is", null)
      : Promise.resolve({ data: [] as { assignment_id: string }[] }),
  ]);

  const completedWorkoutIds = new Set((sessionRows.data ?? []).map((r) => r.assigned_workout_id));
  const completedFormIds = new Set((responseRows.data ?? []).map((r) => r.assignment_id));

  return rows.map((r) => ({
    kind: r.type,
    id: r.id,
    title: r.name,
    date: r.scheduled_date,
    startTime: null,
    endTime: null,
    allDay: true,
    hasVideoCall: false,
    completed: r.type === "workout" ? completedWorkoutIds.has(r.id) : completedFormIds.has(r.id),
    assignmentId: r.id,
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

  const assignmentItems = await listScheduledAssignments(supabase, scope.clientId, startKey, endKey);

  return [...callItems, ...assignmentItems];
}
