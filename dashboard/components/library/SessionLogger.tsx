"use client";

import { useState } from "react";
import {
  addSessionSet,
  deleteSessionSet,
  updateSessionExercise,
  updateSessionSet,
} from "@/app/client/sessions/actions";
import { groupIntoUnits } from "@/lib/workout-blocks";
import { formatClock } from "@/lib/time-format";
import { useActiveTimer } from "./ActiveTimerProvider";
import { VideoPreview } from "./VideoPreview";
import type { AssignedBlock, AssignedExerciseItem } from "./AssignedExerciseList";

export interface SessionExerciseState {
  id: string; // workout_session_exercises.id
  completed: boolean;
  is_pr: boolean;
  notes: string | null;
}

export interface SessionSetState {
  id: string;
  set_number: number;
  reps: string | null;
  duration_seconds: number | null;
  weight: string | null;
  rest_seconds: number | null;
}

const cellInputClass =
  "w-full rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1 text-xs text-ink-primary outline-none";

function SetRow({
  exerciseName,
  isTimed,
  weightUnit,
  set,
  onChange,
  onDelete,
}: {
  exerciseName: string;
  isTimed: boolean;
  weightUnit: string;
  set: SessionSetState;
  onChange: (next: SessionSetState) => void;
  onDelete: () => void;
}) {
  const { start } = useActiveTimer();

  function saveField(patch: Partial<SessionSetState>) {
    const next = { ...set, ...patch };
    onChange(next);
    const formData = new FormData();
    if (next.reps) formData.set("reps", next.reps);
    if (next.duration_seconds != null) formData.set("duration_seconds", String(next.duration_seconds));
    if (next.weight) formData.set("weight", next.weight);
    if (next.rest_seconds != null) formData.set("rest_seconds", String(next.rest_seconds));
    updateSessionSet(set.id, formData);
  }

  function openWorkTimer() {
    start({
      kind: "work",
      setId: set.id,
      exerciseName,
      setNumber: set.set_number,
      seconds: set.duration_seconds ?? 30,
      onFinish: (elapsed) => saveField({ duration_seconds: elapsed }),
    });
  }

  function openRestTimer() {
    start({
      kind: "rest",
      setId: set.id,
      exerciseName,
      setNumber: set.set_number,
      seconds: set.rest_seconds ?? 60,
      onFinish: (elapsed) => saveField({ rest_seconds: elapsed }),
    });
  }

  return (
    <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-2">
      <span className="w-5 text-center text-xs font-medium text-ink-muted">{set.set_number}</span>

      {isTimed ? (
        <button
          type="button"
          onClick={openWorkTimer}
          className="rounded-md border border-[color:var(--border-hairline)] px-2 py-1 text-xs text-ink-primary"
        >
          {set.duration_seconds ? formatClock(set.duration_seconds) : "Start"}
        </button>
      ) : (
        <input
          defaultValue={set.reps ?? ""}
          placeholder="Reps"
          onBlur={(e) => saveField({ reps: e.target.value.trim() || null })}
          className={cellInputClass}
        />
      )}

      <div className="flex items-center gap-1">
        <input
          defaultValue={set.weight ?? ""}
          placeholder="Weight"
          onBlur={(e) => saveField({ weight: e.target.value.trim() || null })}
          className={cellInputClass}
        />
        <span className="shrink-0 text-[10px] text-ink-muted">{weightUnit}</span>
      </div>

      <button
        type="button"
        onClick={openRestTimer}
        className="rounded-md border border-[color:var(--border-hairline)] px-2 py-1 text-xs text-ink-primary"
      >
        {set.rest_seconds ? formatClock(set.rest_seconds) : "Rest"}
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-xs text-ink-muted hover:text-red-600 dark:hover:text-red-400"
        aria-label={`Delete set ${set.set_number}`}
      >
        ✕
      </button>
    </div>
  );
}

function ExerciseSessionCard({
  sessionId,
  item,
  exercise,
  initialSets,
  weightUnit,
  photoUrl,
  videoUrl,
}: {
  sessionId: string;
  item: AssignedExerciseItem;
  exercise: SessionExerciseState;
  initialSets: SessionSetState[];
  weightUnit: string;
  photoUrl: string | null;
  videoUrl: string | null;
}) {
  const [sets, setSets] = useState(initialSets);
  const [completed, setCompleted] = useState(exercise.completed);
  const [isPr, setIsPr] = useState(exercise.is_pr);
  const isTimed = item.prescription_type === "time";

  function saveExerciseFields(patch: { completed?: boolean; is_pr?: boolean; notes?: string | null }) {
    const nextCompleted = patch.completed ?? completed;
    const nextIsPr = patch.is_pr ?? isPr;
    const formData = new FormData();
    if (nextCompleted) formData.set("completed", "on");
    if (nextIsPr) formData.set("is_pr", "on");
    const notes = patch.notes !== undefined ? patch.notes : exercise.notes;
    if (notes) formData.set("notes", notes);
    updateSessionExercise(sessionId, item.id, formData);
  }

  async function handleAddSet() {
    const newSet = await addSessionSet(exercise.id);
    if (newSet) setSets((prev) => [...prev, newSet]);
  }

  async function handleDeleteSet(setId: string) {
    setSets((prev) => prev.filter((s) => s.id !== setId).map((s, i) => ({ ...s, set_number: i + 1 })));
    await deleteSessionSet(exercise.id, setId);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink-primary">{item.name}</div>
          <VideoPreview
            path={item.video_path}
            url={item.video_url}
            resolvedUrl={videoUrl}
            className="mt-1 h-20 w-32 rounded-md border border-[color:var(--border-hairline)]"
          />
        </div>
      </div>

      <textarea
        defaultValue={exercise.notes ?? ""}
        placeholder="Notes..."
        rows={2}
        onBlur={(e) => saveExerciseFields({ notes: e.target.value.trim() || null })}
        className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-xs text-ink-primary outline-none"
      />

      <div className="flex flex-col gap-1.5">
        {sets.map((set) => (
          <SetRow
            key={set.id}
            exerciseName={item.name}
            isTimed={isTimed}
            weightUnit={weightUnit}
            set={set}
            onChange={(next) => setSets((prev) => prev.map((s) => (s.id === next.id ? next : s)))}
            onDelete={() => handleDeleteSet(set.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddSet}
        className="w-fit rounded-md border border-dashed border-[color:var(--border-hairline)] px-3 py-1 text-xs text-ink-secondary hover:text-ink-primary"
      >
        + Add set
      </button>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => {
              setCompleted(e.target.checked);
              saveExerciseFields({ completed: e.target.checked });
            }}
            className="rounded"
          />
          Done
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={isPr}
            onChange={(e) => {
              setIsPr(e.target.checked);
              saveExerciseFields({ is_pr: e.target.checked });
            }}
            className="rounded"
          />
          New PR
        </label>
      </div>
    </div>
  );
}

export function SessionLogger({
  sessionId,
  exercises,
  blocks,
  exerciseRows,
  setsByExercise,
  weightUnit,
  media,
}: {
  sessionId: string;
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

  function renderCard(item: AssignedExerciseItem) {
    const exercise = exerciseRows[item.id];
    if (!exercise) return null;
    return (
      <ExerciseSessionCard
        sessionId={sessionId}
        item={item}
        exercise={exercise}
        initialSets={setsByExercise[exercise.id] ?? []}
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
            {renderCard(unit.item)}
          </li>
        ) : (
          <li key={unit.key} className="rounded-lg border-2 border-[color:var(--series-exercise)]/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-[color:var(--series-exercise)]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--series-exercise)]">
                {unit.block.block_type}
              </span>
              <span className="text-xs text-ink-muted">{unit.block.rounds} rounds</span>
            </div>
            <ul className="flex flex-col gap-3">
              {unit.members.map((member) => (
                <li key={member.id} className="rounded-md border border-[color:var(--border-hairline)] bg-surface p-2">
                  {renderCard(member)}
                </li>
              ))}
            </ul>
          </li>
        ),
      )}
    </ul>
  );
}
