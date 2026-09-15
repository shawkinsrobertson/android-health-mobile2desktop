import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { VideoPreview } from "@/components/library/VideoPreview";
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

  // No coach_id filter here -- RLS already scopes this to "your own rows
  // plus every shared (coach_id IS NULL) row" (see
  // supabase/migrations/0006_shared_exercises.sql), and a coach should be
  // able to view a shared exercise's detail page, just not edit it.
  const [{ data: exercise, error }, { count: usedInWorkouts }] = await Promise.all([
    supabase
      .from("library_exercises")
      .select("id, coach_id, name, category, instructions, photo_path, photo_url, video_path, video_url")
      .eq("id", params.exerciseId)
      .single(),
    supabase
      .from("library_workout_exercises")
      .select("id", { count: "exact", head: true })
      .eq("exercise_id", params.exerciseId),
  ]);

  if (error || !exercise) redirect("/dashboard/library/exercises");

  const isShared = exercise.coach_id === null;

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
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink-primary">{exercise.name}</h1>
            {isShared && (
              <span className="shrink-0 rounded-full bg-[color:var(--series-sleep)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-sleep)]">
                Shared
              </span>
            )}
          </div>
          {!!usedInWorkouts && (
            <p className="text-xs text-ink-muted">
              Used in {usedInWorkouts} workout{usedInWorkouts === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {!isShared && (
          <form action={deleteExercise.bind(null, exercise.id)}>
            <button
              type="submit"
              className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
            >
              Delete
            </button>
          </form>
        )}
      </div>

      {searchParams.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
      )}

      {isShared ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-4 py-3 text-sm text-ink-muted">
            This is a shared exercise from the base library, managed centrally -- it isn&apos;t
            editable here.
          </p>

          {exercise.category && (
            <div>
              <div className="text-xs text-ink-muted">Category</div>
              <div className="text-sm text-ink-primary">{exercise.category}</div>
            </div>
          )}

          {exercise.instructions && (
            <div>
              <div className="text-xs text-ink-muted">Instructions</div>
              <div className="whitespace-pre-wrap text-sm text-ink-primary">{exercise.instructions}</div>
            </div>
          )}

          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)] object-cover"
            />
          )}
          <VideoPreview path={exercise.video_path} url={exercise.video_url} resolvedUrl={videoUrl} />
        </div>
      ) : (
        <form action={updateExercise.bind(null, exercise.id)} className="flex flex-col gap-4">
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
      )}
    </div>
  );
}
