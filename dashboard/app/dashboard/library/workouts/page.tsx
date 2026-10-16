import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { DraftWorkoutPrompt } from "@/components/library/DraftWorkoutPrompt";

export const dynamic = "force-dynamic";

interface WorkoutRow {
  id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  photo_url: string | null;
  status: "draft" | "published";
}

function WorkoutGrid({ workouts, thumbnails }: { workouts: WorkoutRow[]; thumbnails: (string | null)[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {workouts.map((workout, i) => (
        <li key={workout.id}>
          <Link
            href={`/dashboard/library/workouts/${workout.id}`}
            className="flex items-center gap-3 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-3 hover:bg-[color:var(--page-plane)]"
          >
            {thumbnails[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnails[i]!} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-lg bg-[color:var(--page-plane)]" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-ink-primary">{workout.name}</span>
                {workout.status === "draft" && (
                  <span className="shrink-0 rounded-full bg-[color:var(--accent)]/15 px-1.5 py-0.5 text-xs font-medium text-[color:var(--accent)]">
                    Draft
                  </span>
                )}
              </div>
              {workout.description && (
                <div className="truncate text-xs text-ink-muted">{workout.description}</div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function WorkoutLibraryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_workouts")
    .select("id, name, description, photo_path, photo_url, status")
    .order("name");

  const all = (data ?? []) as WorkoutRow[];
  const drafts = all.filter((w) => w.status === "draft");
  const published = all.filter((w) => w.status === "published");
  const thumbnails = await Promise.all(all.map((w) => resolveMediaUrl(supabase, w.photo_path, w.photo_url)));
  const draftThumbnails = thumbnails.slice(0, drafts.length);
  const publishedThumbnails = thumbnails.slice(drafts.length);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/library" className="text-sm text-ink-secondary hover:text-ink-primary">
            ← Library
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">Workouts</h1>
        </div>
        <Link
          href="/dashboard/library/workouts/new"
          className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
        >
          New workout
        </Link>
      </div>

      <DraftWorkoutPrompt />

      {error ? (
        <p className="text-sm text-danger">
          Couldn&apos;t load workouts: {error.message}
        </p>
      ) : all.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          No workouts yet -- create one and add exercises to it.
        </p>
      ) : (
        <>
          {drafts.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink-primary">Drafts</h2>
              <WorkoutGrid workouts={drafts} thumbnails={draftThumbnails} />
            </div>
          )}
          {published.length > 0 && (
            <div className="flex flex-col gap-3">
              {drafts.length > 0 && <h2 className="text-sm font-semibold text-ink-primary">Published</h2>}
              <WorkoutGrid workouts={published} thumbnails={publishedThumbnails} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
