"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
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

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      coach_id: coachId,
      client_id: clientId,
      created_by: profile.id,
      ...toRow(input),
    })
    .select(EVENT_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create event.");

  revalidateEventPaths(clientId);
  return data as CalendarEventRow;
}

export async function updateEvent(eventId: string, input: EventInput): Promise<CalendarEventRow> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .update(toRow(input))
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
