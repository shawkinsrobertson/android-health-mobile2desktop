import { groupIntoUnits } from "@/lib/workout-blocks";
import { formatClock } from "@/lib/time-format";
import { VideoPreview } from "./VideoPreview";
import type { AssignedBlock, AssignedExerciseItem } from "./AssignedExerciseList";
import type { SessionExerciseState, SessionSetState } from "./SessionLogger";

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

function setSummary(set: SessionSetState, isTimed: boolean, weightUnit: string): string {
  return (
    [
      isTimed ? (set.duration_seconds ? `${formatClock(set.duration_seconds)}` : null) : set.reps ? `${set.reps} reps` : null,
      set.weight ? `${set.weight} ${weightUnit}` : null,
      set.rest_seconds ? `${formatClock(set.rest_seconds)} rest` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Not logged"
  );
}

// Read-only coach view of one logged session: prescribed vs. each set the
// client actually reported, grouped by block the same way as the coach's
// editor and the client's logger (see lib/workout-blocks.ts).
function ExerciseDetail({
  item,
  exercise,
  sets,
  weightUnit,
  photoUrl,
  videoUrl,
}: {
  item: AssignedExerciseItem;
  exercise: SessionExerciseState | undefined;
  sets: SessionSetState[];
  weightUnit: string;
  photoUrl: string | null;
  videoUrl: string | null;
}) {
  const isTimed = item.prescription_type === "time";

  return (
    <div className="flex items-start gap-3">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium text-ink-primary">{item.name}</div>
          {exercise?.completed && (
            <span className="rounded-full bg-[color:var(--series-sleep)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-sleep)]">
              Done
            </span>
          )}
          {exercise?.is_pr && (
            <span className="rounded-full bg-[color:var(--series-heart)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-heart)]">
              PR
            </span>
          )}
        </div>
        <div className="text-xs text-ink-muted">Prescribed: {prescribedSummary(item)}</div>

        {sets.length === 0 ? (
          <div className="text-xs text-ink-secondary">Not logged</div>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {sets.map((set) => (
              <li key={set.id} className="text-xs text-ink-secondary">
                Set {set.set_number}: {setSummary(set, isTimed, weightUnit)}
              </li>
            ))}
          </ul>
        )}

        {exercise?.notes && <p className="mt-1 text-xs text-ink-secondary">{exercise.notes}</p>}
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
  exerciseRows,
  setsByExercise,
  weightUnit,
  media,
}: {
  exercises: AssignedExerciseItem[];
  blocks: AssignedBlock[];
  exerciseRows: Record<string, SessionExerciseState>;
  setsByExercise: Record<string, SessionSetState[]>;
  weightUnit: string;
  media: Record<string, { photoUrl: string | null; videoUrl: string | null }>;
}) {
  const units = groupIntoUnits(exercises, blocks);

  if (units.length === 0) {
    return <p className="text-sm text-ink-muted">No exercises in this workout.</p>;
  }

  function renderDetail(item: AssignedExerciseItem) {
    const exercise = exerciseRows[item.id];
    return (
      <ExerciseDetail
        item={item}
        exercise={exercise}
        sets={exercise ? (setsByExercise[exercise.id] ?? []) : []}
        weightUnit={weightUnit}
        photoUrl={media[item.id]?.photoUrl ?? null}
        videoUrl={media[item.id]?.videoUrl ?? null}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {units.map((unit) =>
        unit.type === "exercise" ? (
          <li key={unit.key} className="rounded-lg border border-[color:var(--border-hairline)] p-3">
            {renderDetail(unit.item)}
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
                  {renderDetail(member)}
                </li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ul>
  );
}
