import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";
import { ensureSessionExercises } from "@/lib/session-log";
import { ActiveTimerProvider } from "@/components/library/ActiveTimerProvider";
import { TimerOverlay } from "@/components/library/TimerOverlay";
import { TimerBanner } from "@/components/library/TimerBanner";
import { WorkoutClock } from "@/components/library/WorkoutClock";
import { SessionLogger } from "@/components/library/SessionLogger";
import type { AssignedBlock, AssignedExerciseItem } from "@/components/library/AssignedExerciseList";
import { completeSession } from "@/app/client/sessions/actions";

export const dynamic = "force-dynamic";

export default async function WorkoutSessionPage({
  params,
  searchParams,
}: {
  params: { assignedWorkoutId: string; sessionId: string };
  searchParams: { error?: string };
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
      .select("id, name, coach_id")
      .eq("id", params.assignedWorkoutId)
      .eq("client_id", profile.id)
      .single(),
    supabase
      .from("workout_sessions")
      .select("id, performed_on, started_at, paused_at, total_paused_seconds, completed_at, notes")
      .eq("id", params.sessionId)
      .eq("client_id", profile.id)
      .single(),
  ]);

  if (!workout || sessionError || !session) redirect(`/client/assigned/workouts/${params.assignedWorkoutId}`);

  const { data: exerciseRows } = await supabase
    .from("assigned_workout_exercises")
    .select(
      "id, order_index, block_id, name, instructions, photo_path, photo_url, video_path, video_url, sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes",
    )
    .eq("assigned_workout_id", workout.id)
    .order("order_index");
  const { data: blockRows } = await supabase
    .from("assigned_workout_blocks")
    .select("id, block_type, rounds, notes")
    .eq("assigned_workout_id", workout.id);

  const exercises = (exerciseRows ?? []) as AssignedExerciseItem[];
  const blocks = (blockRows ?? []) as AssignedBlock[];

  const { exerciseRows: sessionExerciseRows, setsByExercise } = await ensureSessionExercises(
    supabase,
    session.id,
    profile.id,
    workout.coach_id,
    exercises,
  );

  const exerciseMedia = await Promise.all(exercises.map((e) => resolveMediaPair(supabase, e)));
  const media = Object.fromEntries(exercises.map((e, i) => [e.id, exerciseMedia[i]]));

  return (
    <ActiveTimerProvider>
      <TimerBanner />
      <TimerOverlay />
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <div>
          <Link
            href={`/client/assigned/workouts/${workout.id}`}
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ← {workout.name}
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">{workout.name}</h1>
          <p className="text-xs text-ink-muted">
            {new Date(session.performed_on).toLocaleDateString()}
            {session.completed_at && ` · Completed ${new Date(session.completed_at).toLocaleString()}`}
          </p>
        </div>

        {searchParams.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
        )}

        <WorkoutClock
          assignedWorkoutId={workout.id}
          sessionId={session.id}
          initialStartedAt={session.started_at}
          initialPausedAt={session.paused_at}
          initialTotalPausedSeconds={session.total_paused_seconds}
          completedAt={session.completed_at}
        />

        <SessionLogger
          sessionId={session.id}
          exercises={exercises}
          blocks={blocks}
          exerciseRows={sessionExerciseRows}
          setsByExercise={setsByExercise}
          weightUnit={clientProfile.preferredWeightUnit}
          media={media}
        />

        {session.started_at && (
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
                className="w-full rounded-lg bg-[color:var(--series-steps)] px-4 py-3 text-sm font-medium text-white"
              >
                {session.completed_at ? "Save notes" : "Finish Workout"}
              </button>
            </form>
          </section>
        )}
      </div>
    </ActiveTimerProvider>
  );
}
