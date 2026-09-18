"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { getValidGoogleAccessToken } from "@/lib/calendar-connections";
import { insertGoogleEvent, listCalendars } from "@/lib/google-calendar";
import { createDailyRoom } from "@/lib/daily";
import { listEvents, type CalendarEventRow, type DateRange } from "./calendar";

// Called directly from CalendarCard.tsx (a client component) whenever
// the visible view/date range changes -- not a <form> submission, same
// direct-call-plus-local-state pattern chat/coach-notes already use.
// No extra authorization check beyond RLS: passing a scope the caller
// isn't actually part of just returns nothing (or, for a coach passing
// someone else's clientId, RLS's `coach_id = auth.uid() or client_id =
// auth.uid()` only ever matches rows that are already about *this*
// coach, so there's no leak to guard against here that RLS doesn't
// already close).
export async function fetchEvents(
  scope: { coachId: string } | { clientId: string },
  range: DateRange,
): Promise<CalendarEventRow[]> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  return listEvents(supabase, scope, range);
}

const EVENT_COLUMNS =
  "id, coach_id, client_id, created_by, booker_name, booker_email, booker_phone, title, description, location, start_time, end_time, all_day, reminder_minutes_before, has_video_call, video_call_room_name, video_call_room_url, external_source";

export interface EventInput {
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  reminderMinutesBefore?: number | null;
  hasVideoCall?: boolean;
  // Coach caller only: which of their clients this event is shared
  // with, or omit for a personal block on the coach's own calendar.
  // Ignored for a client caller, whose own id is always the client side.
  clientId?: string | null;
  // Only meaningful on create -- writes the new event into the
  // *creator's own* connected Google Calendar via their own token, so
  // this never needs the coach/client cross-user exception
  // get_calendar_sync_token exists for (you can only write to a
  // calendar you connected yourself).
  alsoAddToGoogleCalendar?: boolean;
}

function toRow(input: EventInput) {
  return {
    title: input.title,
    description: input.description || null,
    location: input.location || null,
    start_time: input.startTime,
    end_time: input.endTime,
    all_day: input.allDay ?? false,
    reminder_minutes_before: input.reminderMinutesBefore ?? null,
    has_video_call: input.hasVideoCall ?? false,
  };
}

function revalidateEventPaths(clientId: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/client");
  if (clientId) revalidatePath(`/dashboard/clients/${clientId}`);
}

export async function createEvent(input: EventInput): Promise<CalendarEventRow> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();

  let coachId: string;
  let clientId: string | null;

  if (profile.role === "coach") {
    coachId = profile.id;
    clientId = input.clientId ?? null;
    if (clientId) {
      // RLS would reject the insert anyway if this isn't actually one
      // of the coach's own clients -- checking here just turns that
      // into a clear message instead of a bare RLS/constraint error.
      const clientProfile = await getClientProfile(clientId, supabase);
      if (!clientProfile || clientProfile.coachId !== coachId) {
        throw new Error("Not your client.");
      }
    }
  } else {
    const clientProfile = await getClientProfile(profile.id, supabase);
    if (!clientProfile?.coachId) throw new Error("No coach assigned yet.");
    coachId = clientProfile.coachId;
    clientId = profile.id;
  }

  const row: Record<string, unknown> = {
    coach_id: coachId,
    client_id: clientId,
    created_by: profile.id,
    ...toRow(input),
  };

  // Eager, not lazy-on-first-join (pass 1's original approach): the link
  // needs to be visible and clickable on the event right after saving, not
  // only once someone clicks "Join." Anchored to end_time + 30min same as
  // before, just computed now instead of at join time.
  if (input.hasVideoCall) {
    const roomName = `event-${crypto.randomUUID()}`;
    const expEpochSeconds = Math.floor(new Date(input.endTime).getTime() / 1000) + 30 * 60;
    const { url } = await createDailyRoom(roomName, expEpochSeconds);
    row.video_call_room_name = roomName;
    row.video_call_room_url = url;
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .insert(row)
    .select(EVENT_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create event.");

  if (input.alsoAddToGoogleCalendar) {
    // Best-effort -- the in-app event is already saved either way, so a
    // Google-side failure (token revoked, API hiccup) shouldn't fail
    // event creation itself, just silently skip the "also add" part.
    try {
      const connection = await getValidGoogleAccessToken(supabase, profile.id);
      if (connection) {
        const calendars = await listCalendars(connection.accessToken);
        const primary = calendars.find((c) => c.primary) ?? calendars[0];
        if (primary) {
          await insertGoogleEvent(connection.accessToken, primary.id, {
            title: input.title,
            description: input.description,
            location: input.location,
            startTime: input.startTime,
            endTime: input.endTime,
            allDay: input.allDay ?? false,
          });
        }
      }
    } catch {
      // See above -- not surfaced to the caller.
    }
  }

  revalidateEventPaths(clientId);
  return data as CalendarEventRow;
}

export async function updateEvent(eventId: string, input: EventInput): Promise<CalendarEventRow> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  const patch: Record<string, unknown> = toRow(input);

  // Only create a room if this event doesn't already have one -- a known,
  // non-blocking follow-up (tracked in PLANNING.md) is that rescheduling an
  // event with an existing room doesn't currently regenerate its expiry.
  if (input.hasVideoCall) {
    const { data: existing } = await supabase
      .from("calendar_events")
      .select("video_call_room_name, video_call_room_url")
      .eq("id", eventId)
      .single();
    if (!existing?.video_call_room_name || !existing?.video_call_room_url) {
      const roomName = `event-${crypto.randomUUID()}`;
      const expEpochSeconds = Math.floor(new Date(input.endTime).getTime() / 1000) + 30 * 60;
      const { url } = await createDailyRoom(roomName, expEpochSeconds);
      patch.video_call_room_name = roomName;
      patch.video_call_room_url = url;
    }
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", eventId)
    .select(EVENT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update event -- you may not have access to it.");
  }

  revalidateEventPaths(data.client_id);
  return data as CalendarEventRow;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .select("client_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to delete event -- you may not have access to it.");
  }

  revalidateEventPaths(data.client_id);
}
