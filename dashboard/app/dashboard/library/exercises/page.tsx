import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

interface ExerciseRow {
  id: string;
  name: string;
  category: string | null;
  photo_path: string | null;
  photo_url: string | null;
  coach_id: string | null;
}

export default async function ExerciseLibraryPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const q = searchParams.q?.trim() ?? "";

  const supabase = await createClient();
  let query = supabase
    .from("library_exercises")
    .select("id, name, category, photo_path, photo_url, coach_id")
    .order("name");
  if (q) {
    // Matches name or category -- a coach searching "squat" or "legs"
    // should both work.
    query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`);
  }
  const { data, error } = await query;

  const exercises = (data ?? []) as ExerciseRow[];
  const thumbnails = await Promise.all(
    exercises.map((e) => resolveMediaUrl(supabase, e.photo_path, e.photo_url)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/library" className="text-sm text-ink-secondary hover:text-ink-primary">
            ← Library
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">Exercises</h1>
        </div>
        <Link
          href="/dashboard/library/exercises/new"
          className="rounded-lg bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
        >
          New exercise
        </Link>
      </div>

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or category..."
          className="w-full max-w-sm rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-2 text-sm text-ink-secondary hover:text-ink-primary"
        >
          Search
        </button>
        {q && (
          <Link
            href="/dashboard/library/exercises"
            className="flex items-center px-2 text-sm text-ink-muted hover:text-ink-primary"
          >
            Clear
          </Link>
        )}
      </form>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load exercises: {error.message}
        </p>
      ) : exercises.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          {q ? `No exercises match "${q}".` : "No exercises yet -- create one to start building workouts."}
        </p>
      ) : (
        <>
          {q && (
            <p className="text-xs text-ink-muted">
              {exercises.length} match{exercises.length === 1 ? "" : "es"} for &quot;{q}&quot;
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exercises.map((exercise, i) => (
              <li key={exercise.id}>
                <Link
                  href={`/dashboard/library/exercises/${exercise.id}`}
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
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-ink-primary">{exercise.name}</div>
                      {exercise.coach_id === null && (
                        <span className="shrink-0 rounded-full bg-[color:var(--series-sleep)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-sleep)]">
                          Shared
                        </span>
                      )}
                    </div>
                    {exercise.category && (
                      <div className="truncate text-xs text-ink-muted">{exercise.category}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
