import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaPair } from "@/lib/media";
import { VideoPreview } from "@/components/library/VideoPreview";
import { AssignedExerciseList, type AssignedBlock, type AssignedExerciseItem } from "@/components/library/AssignedExerciseList";

export const dynamic = "force-dynamic";

export default async function AssignedWorkoutPage({
  params,
}: {
  params: { clientId: string; assignedWorkoutId: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const { data: workout, error } = await supabase
    .from("assigned_workouts")
    .select(
      "id, name, description, photo_path, photo_url, video_path, video_url, assigned_at, source_library_workout_id",
    )
    .eq("id", params.assignedWorkoutId)
    .eq("client_id", params.clientId)
    .eq("coach_id", coach.id)
    .single();

  if (error || !workout) redirect(`/dashboard/clients/${params.clientId}`);

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

  const [{ photoUrl, videoUrl }, exerciseMedia, sourceStillExists] = await Promise.all([
    resolveMediaPair(supabase, workout),
    Promise.all(exercises.map((e) => resolveMediaPair(supabase, e))),
    workout.source_library_workout_id
      ? supabase
          .from("library_workouts")
          .select("id")
          .eq("id", workout.source_library_workout_id)
          .eq("coach_id", coach.id)
          .maybeSingle()
          .then((r) => !!r.data)
      : Promise.resolve(false),
  ]);

  const media = Object.fromEntries(exercises.map((e, i) => [e.id, exerciseMedia[i]]));

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Back
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{workout.name}</h1>
        <p className="text-xs text-ink-muted">
          Assigned {new Date(workout.assigned_at).toLocaleDateString()}
          {sourceStillExists && (
            <>
              {" · "}
              <Link
                href={`/dashboard/library/workouts/${workout.source_library_workout_id}`}
                className="underline hover:text-ink-primary"
              >
                originally from your library
              </Link>
            </>
          )}
        </p>
      </div>

      {workout.description && <p className="text-sm text-ink-secondary">{workout.description}</p>}

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]" />
      )}
      <VideoPreview path={workout.video_path} url={workout.video_url} resolvedUrl={videoUrl} />

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Exercises</h2>
        <AssignedExerciseList exercises={exercises} blocks={blocks} media={media} />
      </section>
    </div>
  );
}
