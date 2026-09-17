import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { groupIntoUnits } from "@/lib/workout-blocks";
import { formatClock, sessionDurationSeconds } from "@/lib/time-format";
import { completeSession } from "@/app/client/sessions/actions";
import type { AssignedBlock, AssignedExerciseItem } from "@/components/library/AssignedExerciseList";
import type { SessionExerciseState, SessionSetState } from "@/components/library/SessionLogger";

export const dynamic = "force-dynamic";

function setSummary(set: SessionSetState, isTimed: boolean, weightUnit: string): string {
  return (
    [
      isTimed ? (set.duration_seconds ? formatClock(set.duration_seconds) : null) : set.reps ? `${set.reps} reps` : null,
      set.weight ? `${set.weight} ${weightUnit}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Not logged"
  );
}

export default async function WorkoutSessionSummaryPage({
  params,
}: {
  params: { assignedWorkoutId: string; sessionId: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const [{ data: workout }, { data: session, error: sessionError }] = await Promise.all([
    supabase
      .from("assigned_workouts")
      .select("id, name")
      .eq("id", params.assignedWorkoutId)
      .eq("client_id", profile.id)
      .single(),
    supabase
      .from("workout_sessions")
      .select("id, performed_on, started_at, completed_at, total_paused_seconds, notes")
      .eq("id", params.sessionId)
      .eq("client_id", profile.id)
      .single(),
  ]);

  if (!workout || sessionError || !session) redirect(`/client/assigned/workouts/${params.assignedWorkoutId}`);

  // Only a finished session has a summary -- send an in-progress one back
  // to the live tracking page instead of showing a half-empty recap.
  if (!session.completed_at) {
    redirect(`/client/assigned/workouts/${workout.id}/sessions/${session.id}`);
  }

  const [{ data: exerciseRows }, { data: blockRows }] = await Promise.all([
    supabase
      .from("assigned_workout_exercises")
      .select("id, order_index, block_id, name, prescription_type")
      .eq("assigned_workout_id", workout.id)
      .order("order_index"),
    supabase
      .from("assigned_workout_blocks")
      .select("id, block_type, rounds, notes")
      .eq("assigned_workout_id", workout.id),
  ]);

  const exercises = (exerciseRows ?? []) as AssignedExerciseItem[];
  const blocks = (blockRows ?? []) as AssignedBlock[];

  const { data: sessionExerciseData } = await supabase
    .from("workout_session_exercises")
    .select("id, assigned_workout_exercise_id, completed, is_pr, notes")
    .eq("session_id", session.id);

  const exerciseStateRows: Record<string, SessionExerciseState> = {};
  const sessionExerciseIds: string[] = [];
  for (const row of (sessionExerciseData ?? []) as (SessionExerciseState & { assigned_workout_exercise_id: string })[]) {
    exerciseStateRows[row.assigned_workout_exercise_id] = row;
    sessionExerciseIds.push(row.id);
  }

  const { data: setRows } = sessionExerciseIds.length
    ? await supabase
        .from("workout_session_sets")
        .select("id, session_exercise_id, set_number, reps, duration_seconds, weight, rest_seconds")
        .in("session_exercise_id", sessionExerciseIds)
        .order("set_number")
    : { data: [] };

  const setsByExercise: Record<string, SessionSetState[]> = {};
  for (const row of setRows ?? []) {
    const key = row.session_exercise_id as string;
    (setsByExercise[key] ??= []).push(row);
  }

  const prCount = Object.values(exerciseStateRows).filter((e) => e.is_pr).length;
  const duration = sessionDurationSeconds(session.started_at, session.completed_at, session.total_paused_seconds);
  const units = groupIntoUnits(exercises, blocks);
  const weightUnit = clientProfile.preferredWeightUnit;

  function renderExercise(item: AssignedExerciseItem) {
    const state = exerciseStateRows[item.id];
    const sets = state ? (setsByExercise[state.id] ?? []) : [];
    const isTimed = item.prescription_type === "time";

    return (
      <div key={item.id} className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-primary">{item.name}</span>
          {state?.is_pr && (
            <span className="rounded-full bg-[color:var(--series-heart)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-heart)]">
              PR
            </span>
          )}
        </div>
        {sets.length === 0 ? (
          <p className="text-xs text-ink-muted">Not logged</p>
        ) : (
          <p className="text-xs text-ink-secondary">
            {sets.length} set{sets.length === 1 ? "" : "s"} ·{" "}
            {sets.map((s) => setSummary(s, isTimed, weightUnit)).join(", ")}
          </p>
        )}
        {state?.notes && <p className="text-xs text-ink-secondary">{state.notes}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href="/client"
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">Workout complete 🎉</h1>
        <p className="text-sm text-ink-secondary">{workout.name}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {new Date(session.completed_at).toLocaleString()}
          {duration > 0 && ` · ${formatClock(duration)}`}
          {prCount > 0 && ` · ${prCount} PR${prCount === 1 ? "" : "s"}`}
        </p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">What you logged</h2>
        {units.length === 0 ? (
          <p className="text-sm text-ink-muted">No exercises in this workout.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {units.map((unit) =>
              unit.type === "exercise" ? (
                <li key={unit.key}>{renderExercise(unit.item)}</li>
              ) : (
                <li key={unit.key} className="rounded-lg border border-[color:var(--border-hairline)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-[color:var(--series-exercise)]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--series-exercise)]">
                      {unit.block.block_type}
                    </span>
                    <span className="text-xs text-ink-muted">{unit.block.rounds} rounds</span>
                  </div>
                  <div className="flex flex-col gap-3">{unit.members.map((member) => renderExercise(member))}</div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Session notes</h2>
        <form action={completeSession.bind(null, workout.id, session.id)} className="flex flex-col gap-3">
          <textarea
            name="notes"
            rows={3}
            placeholder="How did the whole session go?"
            defaultValue={session.notes ?? ""}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
          />
          <button
            type="submit"
            className="w-full rounded-lg border border-[color:var(--border-hairline)] px-4 py-2 text-sm font-medium text-ink-primary"
          >
            Save notes
          </button>
        </form>
      </section>

      <div className="flex gap-3">
        <Link
          href={`/client/assigned/workouts/${workout.id}/sessions/${session.id}`}
          className="flex-1 rounded-lg border border-[color:var(--border-hairline)] px-4 py-3 text-center text-sm font-medium text-ink-primary"
        >
          Edit sets
        </Link>
        <Link
          href="/client"
          className="flex-1 rounded-lg bg-[color:var(--series-steps)] px-4 py-3 text-center text-sm font-medium text-white"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
