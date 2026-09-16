import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { listCoachThreads } from "@/lib/chat";

export const dynamic = "force-dynamic";

export default async function CoachInboxPage() {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const threads = await listCoachThreads(supabase, coach.id);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-lg font-semibold text-ink-primary">Inbox</h1>

      {threads.length === 0 ? (
        <p className="text-sm text-ink-muted">No clients yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map(({ thread, clientId, clientName, unread }) => (
            <li key={thread.id}>
              <Link
                href={`/dashboard/clients/${clientId}/chat`}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 hover:bg-[color:var(--page-plane)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-primary">{clientName}</span>
                  {unread && <span className="h-2 w-2 rounded-full bg-yellow-400" aria-label="Unread" />}
                </div>
                <span className="text-xs text-ink-muted">
                  {thread.last_message_at ? new Date(thread.last_message_at).toLocaleDateString() : "No messages yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
