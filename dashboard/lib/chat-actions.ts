"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { hasFile } from "@/lib/media";
import { kindForMimeType, uploadChatAttachment } from "@/lib/chat-media";
import type { ChatMessageRow, ChatThreadRow } from "@/lib/chat";

// Fine-grained chat actions (send/react/pin/mark-read) are called directly
// from client components, not <form> submissions, and deliberately skip
// revalidatePath -- the calling components update their own local state
// from the return value, and every other participant's view is kept live
// by the Supabase Realtime subscription in ThreadView/InboxNavLink instead
// (see components/chat/ThreadView.tsx).
//
// Exported (not local to this file) so call-actions.ts can reuse the exact
// same "am I a participant, and which role" check -- lib/chat.ts itself
// can't hold this, since it's imported by client components too
// (InboxNavLink) and this needs next/headers via getCurrentProfile.
export async function requireParticipant(supabase: Awaited<ReturnType<typeof createClient>>, threadId: string) {
  const profile = await getCurrentProfile(supabase);
  if (!profile) redirect("/login");

  const { data: thread, error } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("id", threadId)
    .single();
  if (error || !thread) throw new Error("Chat thread not found.");

  const role: "coach" | "client" | null =
    thread.coach_id === profile.id ? "coach" : thread.client_id === profile.id ? "client" : null;
  if (!role) throw new Error("Not a participant in this thread.");

  return { profile, thread: thread as ChatThreadRow, role };
}

export async function sendChatMessage(
  threadId: string,
  formData: FormData,
): Promise<ChatMessageRow> {
  const supabase = await createClient();
  const { profile, role, thread } = await requireParticipant(supabase, threadId);

  const body = (formData.get("body") as string | null)?.trim() || null;
  const replyToId = (formData.get("reply_to_id") as string | null) || null;
  const durationRaw = formData.get("attachment_duration_seconds");
  const attachmentDuration =
    typeof durationRaw === "string" && durationRaw.trim() ? Number.parseInt(durationRaw, 10) : null;

  const fileValue = formData.get("attachment");
  let attachmentKind: "image" | "video" | "audio" | null = null;
  let attachmentPath: string | null = null;
  let attachmentMime: string | null = null;

  if (hasFile(fileValue)) {
    attachmentKind = kindForMimeType(fileValue.type);
    if (!attachmentKind) throw new Error("Unsupported attachment type.");
    attachmentPath = await uploadChatAttachment(supabase, threadId, fileValue);
    attachmentMime = fileValue.type || null;
  }

  if (!body && !attachmentPath) throw new Error("Message can't be empty.");

  const now = new Date().toISOString();

  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      coach_id: thread.coach_id,
      client_id: thread.client_id,
      sender_id: profile.id,
      sender_role: role,
      body,
      reply_to_id: replyToId,
      attachment_kind: attachmentKind,
      attachment_path: attachmentPath,
      attachment_mime: attachmentMime,
      attachment_duration_seconds: Number.isFinite(attachmentDuration) ? attachmentDuration : null,
    })
    .select(
      "id, thread_id, coach_id, client_id, sender_id, sender_role, body, reply_to_id, attachment_kind, attachment_path, attachment_mime, attachment_duration_seconds, pinned_at, pinned_by, created_at",
    )
    .single();

  if (error || !message) throw new Error(error?.message ?? "Failed to send message.");

  await supabase
    .from("chat_threads")
    .update({
      last_message_at: now,
      last_sender_id: profile.id,
      ...(role === "coach" ? { coach_last_read_at: now } : { client_last_read_at: now }),
    })
    .eq("id", threadId);

  return message as ChatMessageRow;
}

export async function markThreadRead(threadId: string): Promise<void> {
  const supabase = await createClient();
  const { role } = await requireParticipant(supabase, threadId);

  await supabase
    .from("chat_threads")
    .update(
      role === "coach"
        ? { coach_last_read_at: new Date().toISOString() }
        : { client_last_read_at: new Date().toISOString() },
    )
    .eq("id", threadId);
}

export async function toggleReaction(
  threadId: string,
  messageId: string,
  emoji: string,
): Promise<"added" | "removed"> {
  const supabase = await createClient();
  const { profile, thread } = await requireParticipant(supabase, threadId);

  const { data: existing } = await supabase
    .from("chat_message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("profile_id", profile.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from("chat_message_reactions").delete().eq("id", existing.id);
    return "removed";
  }

  await supabase.from("chat_message_reactions").insert({
    message_id: messageId,
    coach_id: thread.coach_id,
    client_id: thread.client_id,
    profile_id: profile.id,
    emoji,
  });
  return "added";
}

export async function togglePin(threadId: string, messageId: string): Promise<boolean> {
  const supabase = await createClient();
  const { profile } = await requireParticipant(supabase, threadId);

  const { data: message } = await supabase
    .from("chat_messages")
    .select("pinned_at")
    .eq("id", messageId)
    .single();

  const nowPinned = !message?.pinned_at;

  await supabase
    .from("chat_messages")
    .update({
      pinned_at: nowPinned ? new Date().toISOString() : null,
      pinned_by: nowPinned ? profile.id : null,
    })
    .eq("id", messageId);

  return nowPinned;
}
