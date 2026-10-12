import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { listCoachThreads } from "@/lib/chat";
import { InboxSidebar } from "@/components/chat/InboxSidebar";

export const dynamic = "force-dynamic";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const threads = await listCoachThreads(supabase, coach.id);

  return (
    <div className="flex items-start gap-6">
      <InboxSidebar
        threads={threads.map((t) => ({
          clientId: t.clientId,
          clientName: t.clientName,
          unread: t.unread,
          lastMessageAt: t.thread.last_message_at,
        }))}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
