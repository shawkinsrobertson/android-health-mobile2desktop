import Link from "next/link";
import type { PersonalRecord } from "@/lib/personal-records";

// Server-rendered, no interactivity -- PRs are computed, not editable by
// either party, so unlike CoachNotes this never needs client-side state.
export function PersonalRecordsList({
  records,
  weightUnit,
  limit,
  seeAllHref,
}: {
  records: PersonalRecord[];
  weightUnit: "lbs" | "kg";
  // Omit to render every record (the full-history page); pass a number to
  // cap the preview (the dashboard card), sorted by most-recently-achieved
  // first so a new PR actually surfaces there.
  limit?: number;
  seeAllHref?: string;
}) {
  if (records.length === 0) {
    return <p className="text-sm text-ink-muted">No personal records yet -- log a few workouts first.</p>;
  }

  const visible = limit
    ? [...records].sort((a, b) => (b.achievedOn || "").localeCompare(a.achievedOn || "")).slice(0, limit)
    : records;
  const remaining = records.length - visible.length;

  return (
    <>
      <ul className="flex flex-col gap-2">
        {visible.map((record) => (
          <li
            key={record.exerciseName}
            className="flex items-center justify-between gap-3 rounded-lg bg-[color:var(--page-plane)] p-3 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-ink-primary">{record.exerciseName}</div>
              <div className="text-xs text-ink-muted">
                {record.achievedOn ? new Date(record.achievedOn).toLocaleDateString() : "—"}
                {record.reps && ` · ${record.reps} reps`}
              </div>
            </div>
            <span className="shrink-0 font-mono text-sm text-ink-primary">
              {record.weight} {weightUnit}
            </span>
          </li>
        ))}
      </ul>

      {seeAllHref && remaining > 0 && (
        <Link
          href={seeAllHref}
          className="mt-3 inline-block text-xs font-medium text-[color:var(--accent)] hover:underline"
        >
          See all {records.length} records →
        </Link>
      )}
    </>
  );
}
