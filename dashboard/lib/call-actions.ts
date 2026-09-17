"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { requireParticipant as requireThreadParticipant } from "@/lib/chat-actions";
import { createDailyRoom, createMeetingToken } from "@/lib/daily";
import type { ChatCallRow } from "@/lib/calls";

// Called directly from client components (CallProvider), same
// no-revalidatePath convention as chat-actions.ts -- every participant's
// view stays current via the chat_calls Realtime subscription instead.

async function requireCallParticipant(supabase: Awaited<ReturnType<typeof createClient>>, callId: string) {
  const profile = await getCurrentProfile(supabase);
  if (!profile) throw new Error("Not signed in.");

  // RLS already scopes this select to rows where I'm a participant -- a
  // call I'm not part of just comes back null, same as a bad id.
  const { data: call, error } = await supabase.from("chat_calls").select("*").eq("id", callId).single();
  if (error || !call) throw new Error("Call not found.");

  return { profile, call: call as ChatCallRow };
}

export async function startCall(
  threadId: string,
): Promise<{ callId: string; roomUrl: string; token: string }> {
  const supabase = await createClient();
  const { profile, thread } = await requireThreadParticipant(supabase, threadId);

  const roomName = `call-${crypto.randomUUID()}`;
  const { url } = await createDailyRoom(roomName);

  const { data: call, error } = await supabase
    .from("chat_calls")
    .insert({
      thread_id: threadId,
      coach_id: thread.coach_id,
      client_id: thread.client_id,
      initiated_by: profile.id,
      daily_room_name: roomName,
      daily_room_url: url,
    })
    .select("id")
    .single();

  if (error || !call) throw new Error(error?.message ?? "Failed to start call.");

  const token = await createMeetingToken(roomName, profile.fullName || profile.email);

  return { callId: call.id, roomUrl: url, token };
}

export async function joinCall(callId: string): Promise<{ roomUrl: string; token: string }> {
  const supabase = await createClient();
  const { profile, call } = await requireCallParticipant(supabase, callId);

  if (call.status === "ringing") {
    await supabase
      .from("chat_calls")
      .update({ status: "accepted", started_at: new Date().toISOString() })
      .eq("id", callId)
      .eq("status", "ringing");
  }

  const token = await createMeetingToken(call.daily_room_name, profile.fullName || profile.email);
  return { roomUrl: call.daily_room_url, token };
}

export async function declineCall(callId: string): Promise<void> {
  const supabase = await createClient();
  await requireCallParticipant(supabase, callId);

  await supabase
    .from("chat_calls")
    .update({ status: "declined", ended_at: new Date().toISOString() })
    .eq("id", callId)
    .eq("status", "ringing");
}

export async function endCall(callId: string): Promise<void> {
  const supabase = await createClient();
  await requireCallParticipant(supabase, callId);

  await supabase
    .from("chat_calls")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", callId)
    .in("status", ["ringing", "accepted"]);
}
