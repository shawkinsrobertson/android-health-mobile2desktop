import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatCallRow {
  id: string;
  thread_id: string;
  coach_id: string;
  client_id: string;
  initiated_by: string;
  daily_room_name: string;
  daily_room_url: string;
  status: "ringing" | "accepted" | "declined" | "ended";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

// The one call a thread page needs on load -- whatever's still ringing or
// in progress, if anything. A thread can have any number of past (ended/
// declined) calls; only the live one matters for initial render, everything
// after that is kept current by the Realtime subscription in CallProvider.
export async function getActiveCall(supabase: SupabaseClient, threadId: string): Promise<ChatCallRow | null> {
  const { data } = await supabase
    .from("chat_calls")
    .select("*")
    .eq("thread_id", threadId)
    .in("status", ["ringing", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ChatCallRow | null) ?? null;
}
