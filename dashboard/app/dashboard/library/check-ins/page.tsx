import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

interface CheckInRow {
  id: string;
  name: string;
  description: string | null;
}

export default async function CheckInLibraryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, description")
    .eq("type", "check_in")
    .eq("coach_id", profile.id)
    .order("name");

  const checkIns = (data ?? []) as CheckInRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/library" className="text-sm text-ink-secondary hover:text-ink-primary">
            ← Library
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">Check-ins</h1>
        </div>
        <Link
          href="/dashboard/library/check-ins/new"
          className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
        >
          New check-in
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-danger">Couldn&apos;t load check-ins: {error.message}</p>
      ) : checkIns.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          No check-ins yet -- build a set of recurring weekly questions.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {checkIns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/library/check-ins/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border-hairline)] bg-surface p-3 hover:bg-[color:var(--page-plane)]"
              >
                <div className="min-w-0">
                  <span className="truncate text-sm font-medium text-ink-primary">{c.name}</span>
                  {c.description && (
                    <div className="truncate text-xs text-ink-muted">{c.description}</div>
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
