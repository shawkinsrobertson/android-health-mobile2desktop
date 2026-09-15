import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";
import { SessionExerciseList } from "@/components/library/SessionExerciseList";
import type { SessionExerciseLog } from "@/components/library/SessionLogger";
import type { AssignedBlock, AssignedExerciseItem } from "@/components/library/AssignedExerciseList";

export const dynamic = "force-dynamic";

export default async function CoachWorkoutSessionPage({
  params,
}: {
  params: { clientId: string; assignedWorkoutId: string; sessionId: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [{ data: workout }, { data: session, error: sessionError }] = await Promise.all([
    supabase
      .from("assigned_workouts")
      .select("id, name")
      .eq("id", params.assignedWorkoutId)
      .eq("client_id", params.clientId)
      .eq("coach_id", coach.id)
      .single(),
    supabase
      .from("workout_sessions")
      .select("id, performed_on, completed_at, notes")
      .eq("id", params.sessionId)
      .eq("coach_id", coach.id)
      .single(),
  ]);

  if (!workout || sessionError || !session) redirect(`/dashboard/clients/${params.clientId}`);

  const [{ data: exerciseRows }, { data: blockRows }, { data: logRows }] = await Promise.all([
    supabase
      .from("assigned_workout_exercises")
      .select(
        "id, order_index, block_id, name, instructions, photo_path, photo_url, video_path, video_url, sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes",
      )
      .eq("assigned_workout_id", workout.id)
      .order("order_index"),
    supabase
      .from("assigned_workout_blocks")
      .select("id, block_type, rounds, notes")
      .eq("assigned_workout_id", workout.id),
    supabase
      .from("workout_session_exercises")
      .select(
        "assigned_workout_exercise_id, completed, is_pr, actual_sets, actual_reps, actual_duration_seconds, actual_weight, notes",
      )
      .eq("session_id", session.id),
  ]);

  const exercises = (exerciseRows ?? []) as AssignedExerciseItem[];
  const blocks = (blockRows ?? []) as AssignedBlock[];
  const exerciseMedia = await Promise.all(exercises.map((e) => resolveMediaPair(supabase, e)));
  const media = Object.fromEntries(exercises.map((e, i) => [e.id, exerciseMedia[i]]));

  const logs: Record<string, SessionExerciseLog> = {};
  for (const row of logRows ?? []) {
    logs[row.assigned_workout_exercise_id] = {
      completed: row.completed,
      is_pr: row.is_pr,
      actual_sets: row.actual_sets,
      actual_reps: row.actual_reps,
      actual_duration_seconds: row.actual_duration_seconds,
      actual_weight: row.actual_weight,
      notes: row.notes,
    };
  }

  const prCount = Object.values(logs).filter((l) => l.is_pr).length;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}/assigned/workouts/${workout.id}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← {workout.name}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">
          Session -- {new Date(session.performed_on).toLocaleDateString()}
        </h1>
        <p className="text-xs text-ink-muted">
          {session.completed_at
            ? `Completed ${new Date(session.completed_at).toLocaleString()}`
            : "Still in progress"}
          {prCount > 0 && ` · ${prCount} PR${prCount === 1 ? "" : "s"}`}
        </p>
        {session.notes && <p className="mt-2 text-sm text-ink-secondary">{session.notes}</p>}
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Exercises</h2>
        <SessionExerciseList exercises={exercises} blocks={blocks} logs={logs} media={media} />
      </section>
    </div>
  );
}
