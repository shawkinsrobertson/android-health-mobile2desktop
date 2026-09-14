"use client";

import { useState, useTransition } from "react";
import {
  addWorkoutExercise,
  removeWorkoutExercise,
  reorderWorkoutExercises,
  updateWorkoutExercise,
} from "@/app/dashboard/library/workouts/actions";

export interface WorkoutExerciseItem {
  id: string;
  exercise_id: string;
  exercise_name: string;
  order_index: number;
  sets: number | null;
  reps: string | null;
  weight_note: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
}

const inputClass =
  "rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1 text-xs text-ink-primary outline-none";

function PrescriptionFields({
  defaults,
}: {
  defaults?: Partial<Pick<WorkoutExerciseItem, "sets" | "reps" | "weight_note" | "rest_seconds" | "tempo" | "notes">>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <input name="sets" type="number" min={0} placeholder="Sets" defaultValue={defaults?.sets ?? ""} className={inputClass} />
      <input name="reps" placeholder="Reps" defaultValue={defaults?.reps ?? ""} className={inputClass} />
      <input name="weight_note" placeholder="Weight" defaultValue={defaults?.weight_note ?? ""} className={inputClass} />
      <input name="rest_seconds" type="number" min={0} placeholder="Rest (sec)" defaultValue={defaults?.rest_seconds ?? ""} className={inputClass} />
      <input name="tempo" placeholder="Tempo" defaultValue={defaults?.tempo ?? ""} className={inputClass} />
      <input name="notes" placeholder="Notes" defaultValue={defaults?.notes ?? ""} className={inputClass} />
    </div>
  );
}

export function WorkoutExerciseListEditor({
  workoutId,
  items,
  availableExercises,
}: {
  workoutId: string;
  items: WorkoutExerciseItem[];
  availableExercises: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  function move(id: string, direction: -1 | 1) {
    const idx = items.findIndex((i) => i.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const reordered = [...items];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    startTransition(() => {
      reorderWorkoutExercises(workoutId, reordered.map((i) => i.id));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">No exercises added yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <li key={item.id} className="rounded-lg border border-[color:var(--border-hairline)] p-3">
              {editingId === item.id ? (
                <form
                  action={async (formData: FormData) => {
                    await updateWorkoutExercise(workoutId, item.id, formData);
                    setEditingId(null);
                  }}
                  className="flex flex-col gap-2"
                >
                  <div className="text-sm font-medium text-ink-primary">{item.exercise_name}</div>
                  <PrescriptionFields defaults={item} />
                  <div className="flex gap-3">
                    <button type="submit" className="rounded-md bg-[color:var(--series-steps)] px-2 py-1 text-xs text-white">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-ink-muted">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-primary">{item.exercise_name}</div>
                    <div className="text-xs text-ink-muted">
                      {[
                        item.sets ? `${item.sets} sets` : null,
                        item.reps ? `${item.reps} reps` : null,
                        item.weight_note,
                        item.rest_seconds ? `${item.rest_seconds}s rest` : null,
                        item.tempo,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No prescription details"}
                    </div>
                    {item.notes && <div className="mt-1 text-xs text-ink-secondary">{item.notes}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0 || isPending}
                      onClick={() => move(item.id, -1)}
                      className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === items.length - 1 || isPending}
                      onClick={() => move(item.id, 1)}
                      className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(item.id)}
                      className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => startTransition(() => removeWorkoutExercise(workoutId, item.id))}
                      className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {availableExercises.length === 0 ? (
        <p className="text-xs text-ink-muted">Create an exercise first to add it here.</p>
      ) : (
        <form
          action={addWorkoutExercise.bind(null, workoutId)}
          className="flex flex-col gap-2 rounded-lg border border-dashed border-[color:var(--border-hairline)] p-3"
        >
          <div className="text-xs font-medium text-ink-secondary">Add exercise</div>
          <select
            name="exercise_id"
            required
            className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
          >
            {availableExercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <PrescriptionFields />
          <button
            type="submit"
            className="w-fit rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
