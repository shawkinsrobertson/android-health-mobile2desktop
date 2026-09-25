import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

interface WorkoutRow {
  id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  photo_url: string | null;
}

export default async function WorkoutLibraryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_workouts")
    .select("id, name, description, photo_path, photo_url")
    .order("name");

  const workouts = (data ?? []) as WorkoutRow[];
  const thumbnails = await Promise.all(
    workouts.map((w) => resolveMediaUrl(supabase, w.photo_path, w.photo_url)),
  );

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

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load workouts: {error.message}
        </p>
      ) : workouts.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          No workouts yet -- create one and add exercises to it.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workouts.map((workout, i) => (
            <li key={workout.id}>
              <Link
                href={`/dashboard/library/workouts/${workout.id}`}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-3 hover:bg-[color:var(--page-plane)]"
              >
                {thumbnails[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnails[i]!}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-[color:var(--page-plane)]" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink-primary">{workout.name}</div>
                  {workout.description && (
                    <div className="truncate text-xs text-ink-muted">{workout.description}</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
