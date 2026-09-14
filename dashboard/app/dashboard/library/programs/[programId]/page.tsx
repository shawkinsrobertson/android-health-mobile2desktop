import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { ProgramWorkoutListEditor, type ProgramWorkoutItem } from "@/components/library/ProgramWorkoutListEditor";
import { updateProgram, deleteProgram } from "../actions";

export const dynamic = "force-dynamic";

interface JoinRow {
  id: string;
  workout_id: string;
  order_index: number;
  week_number: number | null;
  day_of_week: number | null;
  notes: string | null;
  library_workouts: { name: string } | null;
}

export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: { programId: string };
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [{ data: program, error }, { data: joinRows }, { data: workouts }] = await Promise.all([
    supabase
      .from("library_programs")
      .select("id, name, description, photo_path, photo_url, video_path, video_url")
      .eq("id", params.programId)
      .eq("coach_id", profile.id)
      .single(),
    supabase
      .from("library_program_workouts")
      .select("id, workout_id, order_index, week_number, day_of_week, notes, library_workouts(name)")
      .eq("program_id", params.programId)
      .order("order_index"),
    supabase.from("library_workouts").select("id, name").eq("coach_id", profile.id).order("name"),
  ]);

  if (error || !program) redirect("/dashboard/library/programs");

  const [photoUrl, videoUrl] = await Promise.all([
    resolveMediaUrl(supabase, program.photo_path, program.photo_url),
    resolveMediaUrl(supabase, program.video_path, program.video_url),
  ]);

  const items: ProgramWorkoutItem[] = ((joinRows ?? []) as unknown as JoinRow[]).map((row) => ({
    id: row.id,
    workout_id: row.workout_id,
    workout_name: row.library_workouts?.name ?? "Unknown workout",
    order_index: row.order_index,
    week_number: row.week_number,
    day_of_week: row.day_of_week,
    notes: row.notes,
  }));

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/library/programs"
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ← Programs
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">{program.name}</h1>
        </div>
        <form action={deleteProgram.bind(null, program.id)}>
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
        <form action={updateProgram.bind(null, program.id)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink-primary">
            Name
            <input
              name="name"
              required
              defaultValue={program.name}
              className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-primary">
            Description <span className="text-ink-muted">(optional)</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={program.description ?? ""}
              className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
            />
          </label>

          <MediaUploadField
            label="Photo"
            prefix="photo"
            kind="photo"
            previewUrl={photoUrl}
            urlValue={program.photo_url}
            hasStoredFile={!!program.photo_path}
          />
          <MediaUploadField
            label="Video"
            prefix="video"
            kind="video"
            previewUrl={videoUrl}
            urlValue={program.video_url}
            hasStoredFile={!!program.video_path}
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
        <h2 className="mb-3 text-sm font-semibold text-ink-primary">Workouts</h2>
        <ProgramWorkoutListEditor
          programId={program.id}
          items={items}
          availableWorkouts={(workouts ?? []) as { id: string; name: string }[]}
        />
      </section>
    </div>
  );
}
