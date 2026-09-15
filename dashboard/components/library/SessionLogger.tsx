"use client";

import { useState } from "react";
import { logSessionExercise } from "@/app/client/sessions/actions";
import { groupIntoUnits } from "@/lib/workout-blocks";
import { VideoPreview } from "./VideoPreview";
import type { AssignedBlock, AssignedExerciseItem } from "./AssignedExerciseList";

export interface SessionExerciseLog {
  completed: boolean;
  is_pr: boolean;
  actual_sets: number | null;
  actual_reps: string | null;
  actual_duration_seconds: number | null;
  actual_weight: string | null;
  notes: string | null;
}

const inputClass =
  "rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1 text-xs text-ink-primary outline-none";

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
      item.rest_seconds ? `${item.rest_seconds}s rest` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "No prescription details"
  );
}

function ExerciseLogForm({
  assignedWorkoutId,
  sessionId,
  item,
  existing,
  photoUrl,
  videoUrl,
}: {
  assignedWorkoutId: string;
  sessionId: string;
  item: AssignedExerciseItem;
  existing?: SessionExerciseLog;
  photoUrl: string | null;
  videoUrl: string | null;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (formData: FormData) => {
        await logSessionExercise(assignedWorkoutId, sessionId, item.id, formData);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="prescription_type" value={item.prescription_type} />
      <div className="flex items-start gap-3">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-primary">{item.name}</div>
          <div className="text-xs text-ink-muted">Prescribed: {prescribedSummary(item)}</div>
          <VideoPreview
            path={item.video_path}
            url={item.video_url}
            resolvedUrl={videoUrl}
            className="mt-2 max-h-32 w-fit rounded-md border border-[color:var(--border-hairline)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input
          name="actual_sets"
          type="number"
          min={0}
          placeholder="Sets done"
          defaultValue={existing?.actual_sets ?? ""}
          className={inputClass}
        />
        {item.prescription_type === "time" ? (
          <input
            name="actual_duration_seconds"
            type="number"
            min={0}
            placeholder="Duration (sec)"
            defaultValue={existing?.actual_duration_seconds ?? ""}
            className={inputClass}
          />
        ) : (
          <input
            name="actual_reps"
            placeholder="Reps done"
            defaultValue={existing?.actual_reps ?? ""}
            className={inputClass}
          />
        )}
        <input
          name="actual_weight"
          placeholder="Weight used"
          defaultValue={existing?.actual_weight ?? ""}
          className={inputClass}
        />
      </div>
      <input
        name="notes"
        placeholder="Notes (optional)"
        defaultValue={existing?.notes ?? ""}
        className={inputClass}
      />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input type="checkbox" name="completed" defaultChecked={existing?.completed ?? false} className="rounded" />
          Done
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input type="checkbox" name="is_pr" defaultChecked={existing?.is_pr ?? false} className="rounded" />
          New PR
        </label>
        <button type="submit" className="rounded-md bg-[color:var(--series-steps)] px-3 py-1 text-xs font-medium text-white">
          Save
        </button>
        {saved && <span className="text-xs text-ink-muted">Saved.</span>}
      </div>
    </form>
  );
}

export function SessionLogger({
  assignedWorkoutId,
  sessionId,
  exercises,
  blocks,
  logs,
  media,
}: {
  assignedWorkoutId: string;
  sessionId: string;
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
            <ExerciseLogForm
              assignedWorkoutId={assignedWorkoutId}
              sessionId={sessionId}
              item={unit.item}
              existing={logs[unit.item.id]}
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
                  <ExerciseLogForm
                    assignedWorkoutId={assignedWorkoutId}
                    sessionId={sessionId}
                    item={member}
                    existing={logs[member.id]}
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
