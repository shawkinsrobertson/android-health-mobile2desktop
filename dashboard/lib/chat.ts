import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatThreadRow {
  id: string;
  coach_id: string;
  client_id: string;
  last_message_at: string | null;
  last_sender_id: string | null;
  coach_last_read_at: string | null;
  client_last_read_at: string | null;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  coach_id: string;
  client_id: string;
  sender_id: string;
  sender_role: "coach" | "client";
  body: string | null;
  reply_to_id: string | null;
  attachment_kind: "image" | "video" | "audio" | null;
  attachment_path: string | null;
  attachment_mime: string | null;
  attachment_duration_seconds: number | null;
  pinned_at: string | null;
  pinned_by: string | null;
  created_at: string;
}

export interface ChatReactionRow {
  id: string;
  message_id: string;
  profile_id: string;
  emoji: string;
  created_at: string;
}

// True if `role`'s side of the thread has a message it hasn't seen yet --
// drives every "yellow dot" in the UI (NavBar Inbox link, per-client chat
// icon, inbox list rows). Never true for a thread's own most recent
// sender -- sending a message always counts as having read up to it.
export function isThreadUnread(thread: ChatThreadRow, role: "coach" | "client"): boolean {
  if (!thread.last_message_at || !thread.last_sender_id) return false;
  const selfId = role === "coach" ? thread.coach_id : thread.client_id;
  if (thread.last_sender_id === selfId) return false;
  const lastRead = role === "coach" ? thread.coach_last_read_at : thread.client_last_read_at;
  if (!lastRead) return true;
  return new Date(thread.last_message_at).getTime() > new Date(lastRead).getTime();
}

// Idempotent thread lookup/creation -- called directly from a Server
// Component's render (same pattern as ensureSessionExercises in
// lib/session-log.ts), since opening either side's chat page is the first
// time a thread might need to exist.
export async function getOrCreateThread(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<ChatThreadRow> {
  const { data: existing } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (existing) return existing as ChatThreadRow;

  const { data: created, error } = await supabase
    .from("chat_threads")
    .insert({ coach_id: coachId, client_id: clientId })
    .select("*")
    .single();
  if (!error && created) return created as ChatThreadRow;

  // Lost a race with the other participant creating it first.
  const { data: retry } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .single();
  if (!retry) throw new Error("Failed to open chat thread.");
  return retry as ChatThreadRow;
}

// Read-only single-thread lookup (no insert) -- backs the chat icon's
// unread dot on the coach's client overview page.
export async function getThreadReadOnly(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<ChatThreadRow | null> {
  const { data } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as ChatThreadRow | null) ?? null;
}

// Read-only: every thread a profile is party to, with its unread state --
// backs the NavBar "Inbox" dot's initial (pre-realtime) value. Unlike
// getOrCreateThread/listCoachThreads, this never writes a row -- a client
// or client-list entry with no thread yet simply has nothing to be unread.
export async function listThreadsForUnread(
  supabase: SupabaseClient,
  profileId: string,
  role: "coach" | "client",
): Promise<{ id: string; unread: boolean }[]> {
  const { data } = await supabase
    .from("chat_threads")
    .select("*")
    .eq(role === "coach" ? "coach_id" : "client_id", profileId);

  return ((data ?? []) as ChatThreadRow[]).map((thread) => ({
    id: thread.id,
    unread: isThreadUnread(thread, role),
  }));
}

export interface CoachThreadListItem {
  thread: ChatThreadRow;
  clientId: string;
  clientName: string;
  unread: boolean;
}

// Every client currently assigned to this coach, each paired with its
// thread (created on demand) -- backs the coach's /dashboard/inbox list.
export async function listCoachThreads(
  supabase: SupabaseClient,
  coachId: string,
): Promise<CoachThreadListItem[]> {
  const { data: clients } = await supabase
    .from("client_profiles")
    .select("profile_id, profiles!client_profiles_profile_id_fkey(full_name, email)")
    .eq("coach_id", coachId);

  const rows = (clients ?? []) as unknown as {
    profile_id: string;
    profiles: { full_name: string | null; email: string } | null;
  }[];

  const items = await Promise.all(
    rows.map(async (row) => {
      const thread = await getOrCreateThread(supabase, coachId, row.profile_id);
      return {
        thread,
        clientId: row.profile_id,
        clientName: row.profiles?.full_name || row.profiles?.email || "Client",
        unread: isThreadUnread(thread, "coach"),
      };
    }),
  );

  items.sort((a, b) => {
    const aTime = a.thread.last_message_at ? new Date(a.thread.last_message_at).getTime() : 0;
    const bTime = b.thread.last_message_at ? new Date(b.thread.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  return items;
}

export async function fetchThreadMessages(
  supabase: SupabaseClient,
  threadId: string,
): Promise<{ messages: ChatMessageRow[]; reactions: ChatReactionRow[] }> {
  const { data: messages } = await supabase
    .from("chat_messages")
    .select(
      "id, thread_id, coach_id, client_id, sender_id, sender_role, body, reply_to_id, attachment_kind, attachment_path, attachment_mime, attachment_duration_seconds, pinned_at, pinned_by, created_at",
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const messageIds = (messages ?? []).map((m) => m.id);
  const { data: reactions } = messageIds.length
    ? await supabase
        .from("chat_message_reactions")
        .select("id, message_id, profile_id, emoji, created_at")
        .in("message_id", messageIds)
    : { data: [] };

  return {
    messages: (messages ?? []) as ChatMessageRow[],
    reactions: (reactions ?? []) as ChatReactionRow[],
  };
}
