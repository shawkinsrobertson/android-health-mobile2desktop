import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { ProgramWorkoutListEditor, type ProgramWorkoutItem } from "@/components/library/ProgramWorkoutListEditor";
import { AssignToClientCard } from "@/components/library/AssignToClientCard";
import { PublishDeleteActions } from "@/components/library/PublishDeleteActions";
import { updateProgram, deleteProgram, publishProgram } from "../actions";
import { assignLibraryProgramToClient } from "../../assign-actions";

export const dynamic = "force-dynamic";

interface JoinRow {
  id: string;
  child_id: string;
  order_index: number;
  week_number: number | null;
  day_of_week: number | null;
  notes: string | null;
  workout: { name: string } | null;
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

  const [{ data: program, error }, { data: joinRows }, { data: workouts }, { data: clientRows }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, description, photo_path, photo_url, video_path, video_url, status")
      .eq("id", params.programId)
      .eq("type", "program")
      .eq("coach_id", profile.id)
      .single(),
    supabase
      .from("template_components")
      .select(
        "id, child_id, order_index, week_number, day_of_week, notes, workout:templates!template_components_child_id_fkey(name)",
      )
      .eq("parent_id", params.programId)
      .order("order_index"),
    // status='published' only -- see the same filter and comment on the
    // client page's workout picker.
    supabase
      .from("templates")
      .select("id, name")
      .eq("type", "workout")
      .eq("coach_id", profile.id)
      .eq("status", "published")
      .order("name"),
    supabase
      .from("client_profiles")
      .select("profile_id, profiles!client_profiles_profile_id_fkey(full_name, email)")
      .eq("coach_id", profile.id),
  ]);

  if (error || !program) redirect("/dashboard/library/programs");

  const [photoUrl, videoUrl] = await Promise.all([
    resolveMediaUrl(supabase, program.photo_path, program.photo_url),
    resolveMediaUrl(supabase, program.video_path, program.video_url),
  ]);

  const items: ProgramWorkoutItem[] = ((joinRows ?? []) as unknown as JoinRow[]).map((row) => ({
    id: row.id,
    workout_id: row.child_id,
    workout_name: row.workout?.name ?? "Unknown workout",
    order_index: row.order_index,
    week_number: row.week_number,
    day_of_week: row.day_of_week,
    notes: row.notes,
  }));

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
            href="/dashboard/library/programs"
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ← Programs
          </Link>
          <div className="mt-1 flex items-center gap-1.5">
            <h1 className="text-lg font-semibold text-ink-primary">{program.name}</h1>
            {program.status === "draft" && (
              <span className="rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[color:var(--accent)]">
                Draft
              </span>
            )}
          </div>
        </div>
        <PublishDeleteActions
          id={program.id}
          itemLabel="program"
          isDraft={program.status === "draft"}
          onPublish={publishProgram}
          onDelete={deleteProgram}
        />
      </div>

      {searchParams.error && (
        <p className="text-sm text-danger">{searchParams.error}</p>
      )}

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-primary">Details</h2>
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
            className="w-fit rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Save changes
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink-primary">Workouts</h2>
        <ProgramWorkoutListEditor
          programId={program.id}
          items={items}
          availableWorkouts={(workouts ?? []) as { id: string; name: string }[]}
        />
      </section>

      {program.status === "draft" ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          Publish this program before assigning it to a client.
        </p>
      ) : (
        <AssignToClientCard
          itemId={program.id}
          action={assignLibraryProgramToClient}
          clients={clients}
          itemLabel="program"
        />
      )}
    </div>
  );
}
