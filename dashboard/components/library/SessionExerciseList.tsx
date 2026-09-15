import { groupIntoUnits } from "@/lib/workout-blocks";
import { VideoPreview } from "./VideoPreview";
import type { AssignedBlock, AssignedExerciseItem } from "./AssignedExerciseList";
import type { SessionExerciseLog } from "./SessionLogger";

function prescribedSummary(item: AssignedExerciseItem): string {
  return (
    [
      item.sets ? `${item.sets} sets` : null,
      item.prescription_type === "time"
        ? item.duration_seconds
          ? `${item.duration_seconds}s`
          : null
        : item.reps
          ? `${item.reps} reps`
          : null,
      item.weight_note,
    ]
      .filter(Boolean)
      .join(" · ") || "No prescription details"
  );
}

function actualSummary(log: SessionExerciseLog | undefined): string | null {
  if (!log) return null;
  const parts = [
    log.actual_sets ? `${log.actual_sets} sets` : null,
    log.actual_duration_seconds ? `${log.actual_duration_seconds}s` : log.actual_reps ? `${log.actual_reps} reps` : null,
    log.actual_weight,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Read-only coach view of one logged session: prescribed vs. what the
// client actually reported, per exercise, grouped by block the same way
// as the coach's editor and the client's logger (see lib/workout-blocks.ts).
function ExerciseDetail({
  item,
  log,
  photoUrl,
  videoUrl,
}: {
  item: AssignedExerciseItem;
  log: SessionExerciseLog | undefined;
  photoUrl: string | null;
  videoUrl: string | null;
}) {
  const actual = actualSummary(log);

  return (
    <div className="flex items-start gap-3">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium text-ink-primary">{item.name}</div>
          {log?.completed && (
            <span className="rounded-full bg-[color:var(--series-sleep)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-sleep)]">
              Done
            </span>
          )}
          {log?.is_pr && (
            <span className="rounded-full bg-[color:var(--series-heart)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-heart)]">
              PR
            </span>
          )}
        </div>
        <div className="text-xs text-ink-muted">Prescribed: {prescribedSummary(item)}</div>
        <div className="text-xs text-ink-secondary">{actual ? `Actual: ${actual}` : "Not logged"}</div>
        {log?.notes && <p className="mt-1 text-xs text-ink-secondary">{log.notes}</p>}
        <VideoPreview
          path={item.video_path}
          url={item.video_url}
          resolvedUrl={videoUrl}
          className="mt-2 max-h-32 w-fit rounded-md border border-[color:var(--border-hairline)]"
        />
      </div>
    </div>
  );
}

export function SessionExerciseList({
  exercises,
  blocks,
  logs,
  media,
}: {
  exercises: AssignedExerciseItem[];
  blocks: AssignedBlock[];
  logs: Record<string, SessionExerciseLog>;
  media: Record<string, { photoUrl: string | null; videoUrl: string | null }>;
}) {
  const units = groupIntoUnits(exercises, blocks);

  if (units.length === 0) {
    return <p className="text-sm text-ink-muted">No exercises in this workout.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {units.map((unit) =>
        unit.type === "exercise" ? (
          <li key={unit.key} className="rounded-lg border border-[color:var(--border-hairline)] p-3">
            <ExerciseDetail
              item={unit.item}
              log={logs[unit.item.id]}
              photoUrl={media[unit.item.id]?.photoUrl ?? null}
              videoUrl={media[unit.item.id]?.videoUrl ?? null}
            />
          </li>
        ) : (
          <li key={unit.key} className="rounded-lg border-2 border-[color:var(--series-exercise)]/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-[color:var(--series-exercise)]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--series-exercise)]">
                {unit.block.block_type}
              </span>
              <span className="text-xs text-ink-muted">{unit.block.rounds} rounds</span>
            </div>
            <ul className="flex flex-col gap-2">
              {unit.members.map((member) => (
                <li key={member.id} className="rounded-md border border-[color:var(--border-hairline)] bg-surface p-2">
                  <ExerciseDetail
                    item={member}
                    log={logs[member.id]}
                    photoUrl={media[member.id]?.photoUrl ?? null}
                    videoUrl={media[member.id]?.videoUrl ?? null}
                  />
                </li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ul>
  );
}
