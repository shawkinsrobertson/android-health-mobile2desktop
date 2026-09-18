import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { getOrCreateThread, fetchThreadMessages } from "@/lib/chat";
import { getActiveCall } from "@/lib/calls";
import { ThreadView } from "@/components/chat/ThreadView";
import { CallProvider } from "@/components/calls/CallProvider";

export const dynamic = "force-dynamic";

export default async function ClientInboxPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const supabase = await createClient();
  const clientProfile = await getClientProfile(profile.id, supabase);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  if (!clientProfile.coachId) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-4 text-lg font-semibold text-ink-primary">Inbox</h1>
        <p className="text-sm text-ink-muted">You don&apos;t have a coach assigned yet.</p>
      </div>
    );
  }

  const { data: coachRow } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", clientProfile.coachId)
    .single();

  const thread = await getOrCreateThread(supabase, clientProfile.coachId, profile.id);
  const [{ messages, reactions }, activeCall] = await Promise.all([
    fetchThreadMessages(supabase, thread.id),
    getActiveCall(supabase, thread.id),
  ]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-lg font-semibold text-ink-primary">Inbox</h1>
      <CallProvider threadId={thread.id} myProfileId={profile.id} initialCall={activeCall}>
        <ThreadView
          threadId={thread.id}
          clientId={profile.id}
          myProfileId={profile.id}
          counterpartName={coachRow?.full_name || coachRow?.email || "Your coach"}
          initialMessages={messages}
          initialReactions={reactions}
        />
      </CallProvider>
    </div>
  );
}
