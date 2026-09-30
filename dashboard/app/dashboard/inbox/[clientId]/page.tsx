import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getOrCreateThread, fetchThreadMessages } from "@/lib/chat";
import { getActiveCall } from "@/lib/calls";
import { ThreadView } from "@/components/chat/ThreadView";
import { CallProvider } from "@/components/calls/CallProvider";

export const dynamic = "force-dynamic";

// Split-view thread content for /dashboard/inbox -- rendered inside
// InboxLayout's persistent sidebar, so unlike clients/[clientId]/chat/page.tsx
// there's no "back to list" chrome needed here; ThreadView already shows
// its own counterpart-name header.
export default async function InboxThreadPage({ params }: { params: { clientId: string } }) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", params.clientId)
    .single();
  if (error || !client) redirect("/dashboard/inbox");

  const thread = await getOrCreateThread(supabase, coach.id, params.clientId);
  const [{ messages, reactions }, activeCall] = await Promise.all([
    fetchThreadMessages(supabase, thread.id),
    getActiveCall(supabase, thread.id),
  ]);

  return (
    <CallProvider threadId={thread.id} myProfileId={coach.id} initialCall={activeCall}>
      <ThreadView
        threadId={thread.id}
        clientId={params.clientId}
        myProfileId={coach.id}
        counterpartName={client.full_name || client.email || "Client"}
        initialMessages={messages}
        initialReactions={reactions}
      />
    </CallProvider>
  );
}
