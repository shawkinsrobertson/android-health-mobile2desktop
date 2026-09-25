import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";
import { VideoPreview } from "@/components/library/VideoPreview";
import { AssignedExerciseList, type AssignedBlock, type AssignedExerciseItem } from "@/components/library/AssignedExerciseList";
import { startWorkoutSession } from "@/app/client/sessions/actions";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  performed_on: string;
  completed_at: string | null;
}

export default async function ClientAssignedWorkoutPage({
  params,
  searchParams,
}: {
  params: { assignedWorkoutId: string };
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const { data: workout, error } = await supabase
    .from("assigned_workouts")
    .select("id, name, description, photo_path, photo_url, video_path, video_url")
    .eq("id", params.assignedWorkoutId)
    .eq("client_id", profile.id)
    .single();

  if (error || !workout) redirect("/client/assigned");

  const [{ data: exerciseRows }, { data: blockRows }] = await Promise.all([
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
  ]);

  const exercises = (exerciseRows ?? []) as AssignedExerciseItem[];
  const blocks = (blockRows ?? []) as AssignedBlock[];

  const [{ photoUrl, videoUrl }, exerciseMedia] = await Promise.all([
    resolveMediaPair(supabase, workout),
    Promise.all(exercises.map((e) => resolveMediaPair(supabase, e))),
  ]);

  const media = Object.fromEntries(exercises.map((e, i) => [e.id, exerciseMedia[i]]));

  const { data: sessionRows } = await supabase
    .from("workout_sessions")
    .select("id, performed_on, completed_at")
    .eq("assigned_workout_id", workout.id)
    .order("performed_on", { ascending: false });
  const sessions = (sessionRows ?? []) as SessionRow[];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link href="/client/assigned" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Your training
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{workout.name}</h1>
      </div>

      {searchParams.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
      )}

      {workout.description && <p className="text-sm text-ink-secondary">{workout.description}</p>}

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]" />
      )}
      <VideoPreview path={workout.video_path} url={workout.video_url} resolvedUrl={videoUrl} />

      <form action={startWorkoutSession.bind(null, workout.id)}>
        <button
          type="submit"
          className="w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-medium text-white"
        >
          Log this workout
        </button>
      </form>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Exercises</h2>
        <AssignedExerciseList exercises={exercises} blocks={blocks} media={media} />
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Past sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/client/assigned/workouts/${workout.id}/sessions/${s.id}`}
                  className="flex items-center justify-between rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm text-ink-primary hover:bg-[color:var(--border-hairline)]"
                >
                  <span>{new Date(s.performed_on).toLocaleDateString()}</span>
                  <span className="text-xs text-ink-muted">{s.completed_at ? "completed" : "in progress"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
