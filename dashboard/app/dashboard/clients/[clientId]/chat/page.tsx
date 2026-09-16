import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getOrCreateThread, fetchThreadMessages } from "@/lib/chat";
import { ThreadView } from "@/components/chat/ThreadView";

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
  const { messages, reactions } = await fetchThreadMessages(supabase, thread.id);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Link href={`/dashboard/clients/${params.clientId}`} className="text-sm text-ink-secondary hover:text-ink-primary">
        ← {client.full_name || client.email || "Client"}
      </Link>
      <ThreadView
        threadId={thread.id}
        clientId={params.clientId}
        myProfileId={coach.id}
        counterpartName={client.full_name || client.email || "Client"}
        initialMessages={messages}
        initialReactions={reactions}
      />
    </div>
  );
}
