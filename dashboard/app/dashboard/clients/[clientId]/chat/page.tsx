import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getOrCreateThread, fetchThreadMessages } from "@/lib/chat";
import { getActiveCall } from "@/lib/calls";
import { ThreadView } from "@/components/chat/ThreadView";
import { CallProvider } from "@/components/calls/CallProvider";

export const dynamic = "force-dynamic";

export default async function CoachClientChatPage({ params }: { params: { clientId: string } }) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", params.clientId)
    .single();
  if (error || !client) redirect("/dashboard");

  const thread = await getOrCreateThread(supabase, coach.id, params.clientId);
  const [{ messages, reactions }, activeCall] = await Promise.all([
    fetchThreadMessages(supabase, thread.id),
    getActiveCall(supabase, thread.id),
  ]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Link href={`/dashboard/clients/${params.clientId}`} className="text-sm text-ink-secondary hover:text-ink-primary">
        ← {client.full_name || client.email || "Client"}
      </Link>
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
    </div>
  );
}
