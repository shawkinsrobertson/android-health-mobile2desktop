"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { createMeetingToken } from "@/lib/daily";

// The Daily.co room itself is now created eagerly, at save time, by
// createEvent/updateEvent (lib/calendar-actions.ts) -- so the link is
// populated and clickable on the event right away, not only after
// someone's first "Join" click. This just mints a fresh per-participant
// token against that already-existing room, same shape as chat_calls'
// own joinCall (lib/call-actions.ts).
export async function joinCalendarEvent(eventId: string): Promise<{ roomUrl: string; token: string }> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from("calendar_events")
    .select("video_call_room_name, video_call_room_url")
    .eq("id", eventId)
    .single();

  if (error || !event) throw new Error("Event not found.");
  if (!event.video_call_room_name || !event.video_call_room_url) {
    throw new Error("This event doesn't have a video call.");
  }

  const token = await createMeetingToken(event.video_call_room_name, profile.fullName || profile.email);
  return { roomUrl: event.video_call_room_url, token };
}
