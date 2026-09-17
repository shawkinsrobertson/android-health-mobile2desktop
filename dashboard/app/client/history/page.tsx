import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { formatClock, sessionDurationSeconds } from "@/lib/time-format";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  assigned_workout_id: string;
  completed_at: string;
  started_at: string | null;
  total_paused_seconds: number | null;
  assigned_workouts: { name: string } | null;
}

export default async function ClientWorkoutHistoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const { data } = await supabase
    .from("workout_sessions")
    .select("id, assigned_workout_id, completed_at, started_at, total_paused_seconds, assigned_workouts(name)")
    .eq("client_id", profile.id)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  const sessions = (data ?? []) as unknown as SessionRow[];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link href="/client" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">Workout history</h1>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-ink-muted">No finished workouts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/client/assigned/workouts/${s.assigned_workout_id}/sessions/${s.id}/summary`}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 hover:bg-[color:var(--page-plane)]"
              >
                <span className="truncate text-sm font-medium text-ink-primary">
                  {s.assigned_workouts?.name ?? "Workout"}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {new Date(s.completed_at).toLocaleDateString()}
                  {" · "}
                  {formatClock(sessionDurationSeconds(s.started_at, s.completed_at, s.total_paused_seconds))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
