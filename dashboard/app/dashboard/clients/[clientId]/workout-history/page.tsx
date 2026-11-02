import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
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

// Coach-facing counterpart to the client's own /client/history -- today a
// coach can only see session history by opening each assigned workout
// individually (its own "Session history" section); this is the one
// place to see every finished session across all of a client's workouts.
export default async function CoachClientWorkoutHistoryPage({
  params,
}: {
  params: { clientId: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [clientProfile, profileRes] = await Promise.all([
    getClientProfile(params.clientId, supabase),
    supabase.from("profiles").select("full_name, email").eq("id", params.clientId).single(),
  ]);

  if (!clientProfile || clientProfile.coachId !== coach.id || profileRes.error) {
    redirect("/dashboard/clients");
  }

  const client = profileRes.data;

  const { data } = await supabase
    .from("workout_sessions")
    .select("id, assigned_workout_id, completed_at, started_at, total_paused_seconds, assigned_workouts:assignments(name)")
    .eq("client_id", params.clientId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  const sessions = (data ?? []) as unknown as SessionRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← {client?.full_name || client?.email || "Client"}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">Workout history</h1>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">No finished workouts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/dashboard/clients/${params.clientId}/assigned/workouts/${s.assigned_workout_id}/sessions/${s.id}`}
                  className="flex items-center justify-between rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm hover:bg-[color:var(--border-hairline)]"
                >
                  <span className="truncate text-ink-primary">{s.assigned_workouts?.name ?? "Workout"}</span>
                  <span className="shrink-0 pl-2 text-xs text-ink-muted">
                    {new Date(s.completed_at).toLocaleDateString()}
                    {" · "}
                    {formatClock(sessionDurationSeconds(s.started_at, s.completed_at, s.total_paused_seconds))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
