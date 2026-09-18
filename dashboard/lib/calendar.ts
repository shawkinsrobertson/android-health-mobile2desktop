import type { SupabaseClient } from "@supabase/supabase-js";

export interface CalendarEventRow {
  id: string;
  coach_id: string;
  client_id: string | null;
  created_by: string | null;
  booker_name: string | null;
  booker_email: string | null;
  booker_phone: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  reminder_minutes_before: number | null;
  has_video_call: boolean;
  video_call_room_name: string | null;
  video_call_room_url: string | null;
  external_source: "google" | null;
}

const EVENT_COLUMNS =
  "id, coach_id, client_id, created_by, booker_name, booker_email, booker_phone, title, description, location, start_time, end_time, all_day, reminder_minutes_before, has_video_call, video_call_room_name, video_call_room_url, external_source";

export interface DateRange {
  start: string;
  end: string;
}

// Lists events overlapping [range.start, range.end). Scope by coachId for
// the coach's own calendar -- their own calls/sessions/synced personal
// events, *and* every booked appointment under them including
// prospects with no client_id -- or by clientId for one specific
// client's shared events (the coach's client detail page, or a
// client's own dashboard).
export async function listEvents(
  supabase: SupabaseClient,
  scope: { coachId: string } | { clientId: string },
  range: DateRange,
): Promise<CalendarEventRow[]> {
  let query = supabase
    .from("calendar_events")
    .select(EVENT_COLUMNS)
    .lt("start_time", range.end)
    .gt("end_time", range.start)
    .order("start_time", { ascending: true });

  query = "coachId" in scope ? query.eq("coach_id", scope.coachId) : query.eq("client_id", scope.clientId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load calendar events: ${error.message}`);
  return (data ?? []) as CalendarEventRow[];
}

export interface BusyBlock {
  startTime: string;
  endTime: string;
}

// Privacy-scoped for whatever eventually builds AI assistant context
// (Phase 5, not built yet) -- deliberately returns nothing but the busy
// window. Never widen this return type to include title/description/
// location; that's the entire reason this exists as a separate function
// from listEvents rather than a flag/parameter on it.
export async function getBusyBlocks(
  supabase: SupabaseClient,
  clientId: string,
  range: DateRange,
): Promise<BusyBlock[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("start_time, end_time")
    .eq("client_id", clientId)
    .lt("start_time", range.end)
    .gt("end_time", range.start)
    .order("start_time", { ascending: true });

  if (error) throw new Error(`Failed to load busy blocks: ${error.message}`);
  return (data ?? []).map((row) => ({ startTime: row.start_time, endTime: row.end_time }));
}
