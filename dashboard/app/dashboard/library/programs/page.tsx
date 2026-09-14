import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

interface ProgramRow {
  id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  photo_url: string | null;
}

export default async function ProgramLibraryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_programs")
    .select("id, name, description, photo_path, photo_url")
    .order("name");

  const programs = (data ?? []) as ProgramRow[];
  const thumbnails = await Promise.all(
    programs.map((p) => resolveMediaUrl(supabase, p.photo_path, p.photo_url)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/library" className="text-sm text-ink-secondary hover:text-ink-primary">
            ← Library
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">Programs</h1>
        </div>
        <Link
          href="/dashboard/library/programs/new"
          className="rounded-lg bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
        >
          New program
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load programs: {error.message}
        </p>
      ) : programs.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          No programs yet -- create one and add workouts to it.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program, i) => (
            <li key={program.id}>
              <Link
                href={`/dashboard/library/programs/${program.id}`}
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
                  <div className="truncate text-sm font-medium text-ink-primary">{program.name}</div>
                  {program.description && (
                    <div className="truncate text-xs text-ink-muted">{program.description}</div>
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
