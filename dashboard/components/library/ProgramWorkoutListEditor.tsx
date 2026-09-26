"use client";

import { useState, useTransition } from "react";
import {
  addProgramWorkout,
  removeProgramWorkout,
  reorderProgramWorkouts,
  updateProgramWorkout,
} from "@/app/dashboard/library/programs/actions";

export interface ProgramWorkoutItem {
  id: string;
  workout_id: string;
  workout_name: string;
  order_index: number;
  week_number: number | null;
  day_of_week: number | null;
  notes: string | null;
}

const inputClass =
  "rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1 text-xs text-ink-primary outline-none";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleFields({
  defaults,
}: {
  defaults?: Partial<Pick<ProgramWorkoutItem, "week_number" | "day_of_week" | "notes">>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <input
        name="week_number"
        type="number"
        min={1}
        placeholder="Week #"
        defaultValue={defaults?.week_number ?? ""}
        className={inputClass}
      />
      <select name="day_of_week" defaultValue={defaults?.day_of_week ?? ""} className={inputClass}>
        <option value="">Day (any)</option>
        {DAY_NAMES.slice(1).map((d, i) => (
          <option key={d} value={i + 1}>
            {d}
          </option>
        ))}
      </select>
      <input name="notes" placeholder="Notes" defaultValue={defaults?.notes ?? ""} className={inputClass} />
    </div>
  );
}

export function ProgramWorkoutListEditor({
  programId,
  items,
  availableWorkouts,
}: {
  programId: string;
  items: ProgramWorkoutItem[];
  availableWorkouts: { id: string; name: string }[];
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
      reorderProgramWorkouts(programId, reordered.map((i) => i.id));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">No workouts added yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <li key={item.id} className="rounded-lg border border-[color:var(--border-hairline)] p-3">
              {editingId === item.id ? (
                <form
                  action={async (formData: FormData) => {
                    await updateProgramWorkout(programId, item.id, formData);
                    setEditingId(null);
                  }}
                  className="flex flex-col gap-2"
                >
                  <div className="text-sm font-medium text-ink-primary">{item.workout_name}</div>
                  <ScheduleFields defaults={item} />
                  <div className="flex gap-3">
                    <button type="submit" className="rounded-md bg-[color:var(--accent)] px-2 py-1 text-xs text-white">
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
                    <div className="text-sm font-medium text-ink-primary">{item.workout_name}</div>
                    <div className="text-xs text-ink-muted">
                      {[
                        item.week_number ? `Week ${item.week_number}` : null,
                        item.day_of_week ? DAY_NAMES[item.day_of_week] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Unscheduled"}
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
                      onClick={() => startTransition(() => removeProgramWorkout(programId, item.id))}
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

      {availableWorkouts.length === 0 ? (
        <p className="text-xs text-ink-muted">Create a workout first to add it here.</p>
      ) : (
        <form
          action={addProgramWorkout.bind(null, programId)}
          className="flex flex-col gap-2 rounded-lg border border-dashed border-[color:var(--border-hairline)] p-3"
        >
          <div className="text-xs font-medium text-ink-secondary">Add workout</div>
          <select
            name="workout_id"
            required
            className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
          >
            {availableWorkouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <ScheduleFields />
          <button
            type="submit"
            className="w-fit rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
