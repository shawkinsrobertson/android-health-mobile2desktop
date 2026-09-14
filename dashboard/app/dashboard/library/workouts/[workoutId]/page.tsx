import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { WorkoutExerciseListEditor, type WorkoutExerciseItem } from "@/components/library/WorkoutExerciseListEditor";
import { updateWorkout, deleteWorkout } from "../actions";

export const dynamic = "force-dynamic";

interface JoinRow {
  id: string;
  exercise_id: string;
  order_index: number;
  sets: number | null;
  reps: string | null;
  weight_note: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
  library_exercises: { name: string } | null;
}

export default async function WorkoutDetailPage({
  params,
  searchParams,
}: {
  params: { workoutId: string };
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [{ data: workout, error }, { data: joinRows }, { count: usedInPrograms }, { data: exercises }] =
    await Promise.all([
      supabase
        .from("library_workouts")
        .select("id, name, description, photo_path, photo_url, video_path, video_url")
        .eq("id", params.workoutId)
        .eq("coach_id", profile.id)
        .single(),
      supabase
        .from("library_workout_exercises")
        .select(
          "id, exercise_id, order_index, sets, reps, weight_note, rest_seconds, tempo, notes, library_exercises(name)",
        )
        .eq("workout_id", params.workoutId)
        .order("order_index"),
      supabase
        .from("library_program_workouts")
        .select("id", { count: "exact", head: true })
        .eq("workout_id", params.workoutId),
      supabase.from("library_exercises").select("id, name").eq("coach_id", profile.id).order("name"),
    ]);

  if (error || !workout) redirect("/dashboard/library/workouts");

  const [photoUrl, videoUrl] = await Promise.all([
    resolveMediaUrl(supabase, workout.photo_path, workout.photo_url),
    resolveMediaUrl(supabase, workout.video_path, workout.video_url),
  ]);

  const items: WorkoutExerciseItem[] = ((joinRows ?? []) as unknown as JoinRow[]).map((row) => ({
    id: row.id,
    exercise_id: row.exercise_id,
    exercise_name: row.library_exercises?.name ?? "Unknown exercise",
    order_index: row.order_index,
    sets: row.sets,
    reps: row.reps,
    weight_note: row.weight_note,
    rest_seconds: row.rest_seconds,
    tempo: row.tempo,
    notes: row.notes,
  }));

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/library/workouts"
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ← Workouts
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">{workout.name}</h1>
          {!!usedInPrograms && (
            <p className="text-xs text-ink-muted">
              Used in {usedInPrograms} program{usedInPrograms === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <form action={deleteWorkout.bind(null, workout.id)}>
          <button
            type="submit"
            className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
          >
            Delete
          </button>
        </form>
      </div>

      {searchParams.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
      )}

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Details</h2>
        <form action={updateWorkout.bind(null, workout.id)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink-primary">
            Name
            <input
              name="name"
              required
              defaultValue={workout.name}
              className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-primary">
            Description <span className="text-ink-muted">(optional)</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={workout.description ?? ""}
              className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
            />
          </label>

          <MediaUploadField
            label="Photo"
            prefix="photo"
            kind="photo"
            previewUrl={photoUrl}
            urlValue={workout.photo_url}
            hasStoredFile={!!workout.photo_path}
          />
          <MediaUploadField
            label="Video"
            prefix="video"
            kind="video"
            previewUrl={videoUrl}
            urlValue={workout.video_url}
            hasStoredFile={!!workout.video_path}
          />

          <button
            type="submit"
            className="w-fit rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
          >
            Save changes
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Exercises</h2>
        <WorkoutExerciseListEditor
          workoutId={workout.id}
          items={items}
          availableExercises={(exercises ?? []) as { id: string; name: string }[]}
        />
      </section>
    </div>
  );
}
