"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { createDailyRoom, createMeetingToken } from "@/lib/daily";

// Mirrors chat_calls' startCall/joinCall shape (lib/call-actions.ts),
// collapsed into one function: a calendar event's video call isn't
// "started" by a separate action ahead of time, it's just present or
// absent on the event (has_video_call, set by the create/edit modal),
// and whoever clicks "Join" first is the one who actually creates the
// Daily.co room -- lazily, anchored to the event's own end_time (see
// lib/daily.ts's createDailyRoom), not to whenever the event happened to
// be created. A calendar event booked for next week would otherwise get
// a room that expires hours after creation, long before the meeting.
export async function joinCalendarEvent(eventId: string): Promise<{ roomUrl: string; token: string }> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in.");

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from("calendar_events")
    .select("id, end_time, has_video_call, video_call_room_name, video_call_room_url")
    .eq("id", eventId)
    .single();

  if (error || !event) throw new Error("Event not found.");
  if (!event.has_video_call) throw new Error("This event doesn't have a video call.");

  let roomName = event.video_call_room_name as string | null;
  let roomUrl = event.video_call_room_url as string | null;

  if (!roomName || !roomUrl) {
    const newRoomName = `event-${eventId}`;
    const expEpochSeconds = Math.floor(new Date(event.end_time).getTime() / 1000) + 30 * 60;

    try {
      const created = await createDailyRoom(newRoomName, expEpochSeconds);
      await supabase
        .from("calendar_events")
        .update({ video_call_room_name: newRoomName, video_call_room_url: created.url })
        .eq("id", eventId)
        .is("video_call_room_name", null);
      roomName = newRoomName;
      roomUrl = created.url;
    } catch {
      // Most likely a racing "Join" click already created this room --
      // Daily rejects a duplicate room name -- so re-read rather than
      // fail the join outright.
    }

    if (!roomName || !roomUrl) {
      const { data: latest } = await supabase
        .from("calendar_events")
        .select("video_call_room_name, video_call_room_url")
        .eq("id", eventId)
        .single();
      if (!latest?.video_call_room_name || !latest?.video_call_room_url) {
        throw new Error("Failed to set up the video call. Try again.");
      }
      roomName = latest.video_call_room_name;
      roomUrl = latest.video_call_room_url;
    }
  }

  if (!roomName || !roomUrl) throw new Error("Failed to set up the video call. Try again.");

  const token = await createMeetingToken(roomName, profile.fullName || profile.email);
  return { roomUrl, token };
}
