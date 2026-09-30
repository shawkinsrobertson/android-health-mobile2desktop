import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function CoachInboxPage() {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold text-ink-primary">Inbox</h1>
      <p className="text-sm text-ink-secondary">Pick a client from the sidebar to open their thread.</p>
    </div>
  );
}
