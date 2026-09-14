import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { updateExercise, deleteExercise } from "../actions";

export const dynamic = "force-dynamic";

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: {
  params: { exerciseId: string };
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [{ data: exercise, error }, { count: usedInWorkouts }] = await Promise.all([
    supabase
      .from("library_exercises")
      .select("id, name, category, instructions, photo_path, photo_url, video_path, video_url")
      .eq("id", params.exerciseId)
      .eq("coach_id", profile.id)
      .single(),
    supabase
      .from("library_workout_exercises")
      .select("id", { count: "exact", head: true })
      .eq("exercise_id", params.exerciseId),
  ]);

  if (error || !exercise) redirect("/dashboard/library/exercises");

  const [photoUrl, videoUrl] = await Promise.all([
    resolveMediaUrl(supabase, exercise.photo_path, exercise.photo_url),
    resolveMediaUrl(supabase, exercise.video_path, exercise.video_url),
  ]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/library/exercises"
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ← Exercises
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">{exercise.name}</h1>
          {!!usedInWorkouts && (
            <p className="text-xs text-ink-muted">
              Used in {usedInWorkouts} workout{usedInWorkouts === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <form action={deleteExercise.bind(null, exercise.id)}>
          <button
            type="submit"
            className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
          >
            Delete
          </button>
        </form>
      </div>

      <form action={updateExercise.bind(null, exercise.id)} className="flex flex-col gap-4">
        {searchParams.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Name
          <input
            name="name"
            required
            defaultValue={exercise.name}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Category <span className="text-ink-muted">(optional)</span>
          <input
            name="category"
            defaultValue={exercise.category ?? ""}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Instructions <span className="text-ink-muted">(optional)</span>
          <textarea
            name="instructions"
            rows={4}
            defaultValue={exercise.instructions ?? ""}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <MediaUploadField
          label="Photo"
          prefix="photo"
          kind="photo"
          previewUrl={photoUrl}
          urlValue={exercise.photo_url}
          hasStoredFile={!!exercise.photo_path}
        />
        <MediaUploadField
          label="Video"
          prefix="video"
          kind="video"
          previewUrl={videoUrl}
          urlValue={exercise.video_url}
          hasStoredFile={!!exercise.video_path}
        />

        <button
          type="submit"
          className="w-fit rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
