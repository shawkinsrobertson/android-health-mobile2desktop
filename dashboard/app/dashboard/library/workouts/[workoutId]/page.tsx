import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import {
  WorkoutExerciseListEditor,
  type WorkoutBlock,
  type WorkoutExerciseItem,
} from "@/components/library/WorkoutExerciseListEditor";
import { AssignToClientCard } from "@/components/library/AssignToClientCard";
import { PublishDeleteActions } from "@/components/library/PublishDeleteActions";
import { updateWorkout, deleteWorkout, publishWorkout } from "../actions";
import { assignLibraryWorkoutToClient } from "../../assign-actions";

export const dynamic = "force-dynamic";

interface JoinRow {
  id: string;
  child_id: string;
  order_index: number;
  group_id: string | null;
  sets: number | null;
  reps: string | null;
  prescription_type: "reps" | "time";
  duration_seconds: number | null;
  weight_note: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
  exercise: { name: string } | null;
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

  const [{ data: workout, error }, { data: joinRows }, { data: blockRows }, { count: usedInPrograms }, { data: exercises }, { data: clientRows }] =
    await Promise.all([
      supabase
        .from("templates")
        .select("id, name, description, photo_path, photo_url, video_path, video_url, status")
        .eq("id", params.workoutId)
        .eq("type", "workout")
        .eq("coach_id", profile.id)
        .single(),
      supabase
        .from("template_components")
        .select(
          "id, child_id, order_index, group_id, sets, reps, prescription_type, duration_seconds, weight_note, rest_seconds, tempo, notes, exercise:templates!template_components_child_id_fkey(name)",
        )
        .eq("parent_id", params.workoutId)
        .order("order_index"),
      supabase
        .from("template_component_groups")
        .select("id, block_type, rounds, notes")
        .eq("parent_id", params.workoutId),
      supabase
        .from("template_components")
        .select("id", { count: "exact", head: true })
        .eq("child_id", params.workoutId),
      // No coach_id filter -- RLS already includes shared (coach_id IS
      // NULL) exercises alongside this coach's own, so they show up as
      // addable options too (see supabase/migrations/0006_shared_exercises.sql).
      supabase.from("templates").select("id, name, coach_id").eq("type", "exercise").order("name"),
      supabase
        .from("client_profiles")
        .select("profile_id, profiles!client_profiles_profile_id_fkey(full_name, email)")
        .eq("coach_id", profile.id),
    ]);

  if (error || !workout) redirect("/dashboard/library/workouts");

  const [photoUrl, videoUrl] = await Promise.all([
    resolveMediaUrl(supabase, workout.photo_path, workout.photo_url),
    resolveMediaUrl(supabase, workout.video_path, workout.video_url),
  ]);

  const items: WorkoutExerciseItem[] = ((joinRows ?? []) as unknown as JoinRow[]).map((row) => ({
    id: row.id,
    exercise_id: row.child_id,
    exercise_name: row.exercise?.name ?? "Unknown exercise",
    order_index: row.order_index,
    block_id: row.group_id,
    sets: row.sets,
    reps: row.reps,
    prescription_type: row.prescription_type,
    duration_seconds: row.duration_seconds,
    weight_note: row.weight_note,
    rest_seconds: row.rest_seconds,
    tempo: row.tempo,
    notes: row.notes,
  }));

  const blocks = (blockRows ?? []) as WorkoutBlock[];

  const clients = (
    (clientRows ?? []) as unknown as {
      profile_id: string;
      profiles: { full_name: string | null; email: string } | null;
    }[]
  ).map((c) => ({ id: c.profile_id, name: c.profiles?.full_name || c.profiles?.email || "Unnamed client" }));

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
          <div className="mt-1 flex items-center gap-1.5">
            <h1 className="text-lg font-semibold text-ink-primary">{workout.name}</h1>
            {workout.status === "draft" && (
              <span className="rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[color:var(--accent)]">
                Draft
              </span>
            )}
          </div>
          {!!usedInPrograms && (
            <p className="text-xs text-ink-muted">
              Used in {usedInPrograms} program{usedInPrograms === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <PublishDeleteActions
          id={workout.id}
          itemLabel="workout"
          isDraft={workout.status === "draft"}
          onPublish={publishWorkout}
          onDelete={deleteWorkout}
        />
      </div>

      {searchParams.error && (
        <p className="text-sm text-danger">{searchParams.error}</p>
      )}

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-primary">Details</h2>
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
            className="w-fit rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Save changes
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-primary">Exercises</h2>
        <WorkoutExerciseListEditor
          workoutId={workout.id}
          items={items}
          blocks={blocks}
          availableExercises={((exercises ?? []) as { id: string; name: string; coach_id: string | null }[]).map(
            (e) => ({ id: e.id, name: e.name, shared: e.coach_id === null }),
          )}
        />
      </section>

      {workout.status === "draft" ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          Publish this workout before assigning it to a client.
        </p>
      ) : (
        <AssignToClientCard
          itemId={workout.id}
          action={assignLibraryWorkoutToClient}
          clients={clients}
          itemLabel="workout"
        />
      )}
    </div>
  );
}
