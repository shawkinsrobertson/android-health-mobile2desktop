"use client";

import { useState, useTransition } from "react";
import {
  addWorkoutExercise,
  createWorkoutBlock,
  deleteWorkoutBlock,
  moveWorkoutUnit,
  removeWorkoutExercise,
  reorderWorkoutExercises,
  ungroupWorkoutBlock,
  updateWorkoutBlock,
  updateWorkoutExercise,
} from "@/app/dashboard/library/workouts/actions";
import { groupIntoUnits, type Unit as WorkoutUnit } from "@/lib/workout-blocks";

export interface WorkoutExerciseItem {
  id: string;
  exercise_id: string;
  exercise_name: string;
  order_index: number;
  block_id: string | null;
  sets: number | null;
  reps: string | null;
  prescription_type: "reps" | "time";
  duration_seconds: number | null;
  weight_note: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export interface WorkoutBlock {
  id: string;
  block_type: "superset" | "circuit";
  rounds: number;
  notes: string | null;
}

// See lib/workout-blocks.ts for the grouping algorithm (shared with the
// read-only assigned-workout views).
type Unit = WorkoutUnit<WorkoutExerciseItem, WorkoutBlock>;

const inputClass =
  "rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1 text-xs text-ink-primary outline-none";

function PrescriptionFields({
  defaults,
}: {
  defaults?: Partial<
    Pick<
      WorkoutExerciseItem,
      "sets" | "reps" | "prescription_type" | "duration_seconds" | "weight_note" | "rest_seconds" | "tempo" | "notes"
    >
  >;
}) {
  const [timed, setTimed] = useState(defaults?.prescription_type === "time");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4 text-xs text-ink-secondary">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="prescription_type"
            value="reps"
            checked={!timed}
            onChange={() => setTimed(false)}
          />
          Reps
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="prescription_type"
            value="time"
            checked={timed}
            onChange={() => setTimed(true)}
          />
          Timed
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input name="sets" type="number" min={0} placeholder="Sets" defaultValue={defaults?.sets ?? ""} className={inputClass} />
        {timed ? (
          <input
            name="duration_seconds"
            type="number"
            min={0}
            placeholder="Duration (sec)"
            defaultValue={defaults?.duration_seconds ?? ""}
            className={inputClass}
          />
        ) : (
          <input name="reps" placeholder="Reps" defaultValue={defaults?.reps ?? ""} className={inputClass} />
        )}
        <input name="weight_note" placeholder="Weight" defaultValue={defaults?.weight_note ?? ""} className={inputClass} />
        <input name="rest_seconds" type="number" min={0} placeholder="Rest (sec)" defaultValue={defaults?.rest_seconds ?? ""} className={inputClass} />
        <input name="tempo" placeholder="Tempo" defaultValue={defaults?.tempo ?? ""} className={inputClass} />
        <input name="notes" placeholder="Notes" defaultValue={defaults?.notes ?? ""} className={inputClass} />
      </div>
    </div>
  );
}

function summarize(item: WorkoutExerciseItem): string {
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
      item.tempo,
    ]
      .filter(Boolean)
      .join(" · ") || "No prescription details"
  );
}

function ExerciseRow({
  workoutId,
  item,
  editing,
  onEdit,
  onCancelEdit,
  onRemove,
  selectable,
  selected,
  onToggleSelected,
  isPending,
}: {
  workoutId: string;
  item: WorkoutExerciseItem;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  isPending: boolean;
}) {
  if (editing) {
    return (
      <form
        action={async (formData: FormData) => {
          await updateWorkoutExercise(workoutId, item.id, formData);
          onCancelEdit();
        }}
        className="flex flex-col gap-2"
      >
        <div className="text-sm font-medium text-ink-primary">{item.exercise_name}</div>
        <PrescriptionFields defaults={item} />
        <div className="flex gap-3">
          <button type="submit" className="rounded-md bg-[color:var(--series-steps)] px-2 py-1 text-xs text-white">
            Save
          </button>
          <button type="button" onClick={onCancelEdit} className="text-xs text-ink-muted">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            className="mt-1 rounded"
            aria-label={`Select ${item.exercise_name} to group`}
          />
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-primary">{item.exercise_name}</div>
          <div className="text-xs text-ink-muted">{summarize(item)}</div>
          {item.notes && <div className="mt-1 text-xs text-ink-secondary">{item.notes}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onRemove}
          className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export function WorkoutExerciseListEditor({
  workoutId,
  items,
  blocks,
  availableExercises,
}: {
  workoutId: string;
  items: WorkoutExerciseItem[];
  blocks: WorkoutBlock[];
  availableExercises: { id: string; name: string; shared?: boolean }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupType, setGroupType] = useState<"superset" | "circuit">("superset");
  const [groupRounds, setGroupRounds] = useState(3);

  const units = groupIntoUnits(items, blocks);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function moveUnit(key: string, direction: -1 | 1) {
    startTransition(() => {
      moveWorkoutUnit(workoutId, key, direction);
    });
  }

  function moveWithinBlock(members: WorkoutExerciseItem[], itemId: string, direction: -1 | 1) {
    const idx = members.findIndex((m) => m.id === itemId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= members.length) return;
    const reordered = [...members];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    startTransition(() => {
      reorderWorkoutExercises(workoutId, reordered.map((m) => m.id));
    });
  }

  function group() {
    if (selectedIds.length < 2) return;
    startTransition(() => {
      createWorkoutBlock(workoutId, groupType, groupRounds, selectedIds);
    });
    setSelectedIds([]);
  }

  return (
    <div className="flex flex-col gap-3">
      {units.length === 0 ? (
        <p className="text-sm text-ink-muted">No exercises added yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {units.map((unit, idx) => (
            <li key={unit.key}>
              {unit.type === "exercise" ? (
                <div className="rounded-lg border border-[color:var(--border-hairline)] p-3">
                  <div className="mb-1 flex justify-end gap-1">
                    <UnitMoveButtons
                      disabledUp={idx === 0 || isPending}
                      disabledDown={idx === units.length - 1 || isPending}
                      onUp={() => moveUnit(unit.key, -1)}
                      onDown={() => moveUnit(unit.key, 1)}
                    />
                  </div>
                  <ExerciseRow
                    workoutId={workoutId}
                    item={unit.item}
                    editing={editingId === unit.item.id}
                    onEdit={() => setEditingId(unit.item.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onRemove={() => startTransition(() => removeWorkoutExercise(workoutId, unit.item.id))}
                    selectable
                    selected={selectedIds.includes(unit.item.id)}
                    onToggleSelected={() => toggleSelected(unit.item.id)}
                    isPending={isPending}
                  />
                </div>
              ) : (
                <div className="rounded-lg border-2 border-[color:var(--series-exercise)]/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[color:var(--series-exercise)]/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--series-exercise)]">
                        {unit.block.block_type}
                      </span>
                      <span className="text-xs text-ink-muted">{unit.block.rounds} rounds</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <UnitMoveButtons
                        disabledUp={idx === 0 || isPending}
                        disabledDown={idx === units.length - 1 || isPending}
                        onUp={() => moveUnit(unit.key, -1)}
                        onDown={() => moveUnit(unit.key, 1)}
                      />
                      <button
                        type="button"
                        onClick={() => setEditingBlockId(editingBlockId === unit.block.id ? null : unit.block.id)}
                        className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => startTransition(() => ungroupWorkoutBlock(workoutId, unit.block.id))}
                        className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary"
                      >
                        Ungroup
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => startTransition(() => deleteWorkoutBlock(workoutId, unit.block.id))}
                        className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingBlockId === unit.block.id && (
                    <form
                      action={async (formData: FormData) => {
                        await updateWorkoutBlock(workoutId, unit.block.id, formData);
                        setEditingBlockId(null);
                      }}
                      className="mb-3 flex flex-wrap items-end gap-2 rounded-md bg-[color:var(--page-plane)] p-2"
                    >
                      <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                        Type
                        <select name="block_type" defaultValue={unit.block.block_type} className={inputClass}>
                          <option value="superset">Superset</option>
                          <option value="circuit">Circuit</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                        Rounds
                        <input
                          name="rounds"
                          type="number"
                          min={1}
                          defaultValue={unit.block.rounds}
                          className={`${inputClass} w-20`}
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-1 text-xs text-ink-secondary">
                        Notes
                        <input name="notes" defaultValue={unit.block.notes ?? ""} className={inputClass} />
                      </label>
                      <button type="submit" className="rounded-md bg-[color:var(--series-steps)] px-2 py-1 text-xs text-white">
                        Save
                      </button>
                    </form>
                  )}

                  {unit.block.block_type === "superset" && (
                    <p className="mb-2 text-xs text-ink-muted">
                      Performed back-to-back, no rest in between -- only the last exercise&apos;s rest applies (before the next round).
                    </p>
                  )}
                  {unit.block.block_type === "circuit" && (
                    <p className="mb-2 text-xs text-ink-muted">
                      Each exercise&apos;s rest is the rest before the next one -- the last exercise&apos;s rest is the rest between rounds.
                    </p>
                  )}

                  <ul className="flex flex-col gap-2">
                    {unit.members.map((member, memberIdx) => (
                      <li key={member.id} className="rounded-md border border-[color:var(--border-hairline)] bg-surface p-2">
                        <div className="mb-1 flex justify-end gap-1">
                          <UnitMoveButtons
                            disabledUp={memberIdx === 0 || isPending}
                            disabledDown={memberIdx === unit.members.length - 1 || isPending}
                            onUp={() => moveWithinBlock(unit.members, member.id, -1)}
                            onDown={() => moveWithinBlock(unit.members, member.id, 1)}
                          />
                        </div>
                        <ExerciseRow
                          workoutId={workoutId}
                          item={member}
                          editing={editingId === member.id}
                          onEdit={() => setEditingId(member.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onRemove={() => startTransition(() => removeWorkoutExercise(workoutId, member.id))}
                          selectable={false}
                          selected={false}
                          onToggleSelected={() => {}}
                          isPending={isPending}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {selectedIds.length >= 2 && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[color:var(--series-exercise)] p-3">
          <div className="text-xs font-medium text-ink-secondary">
            Group {selectedIds.length} selected exercises as:
          </div>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Type
            <select
              value={groupType}
              onChange={(e) => setGroupType(e.target.value as "superset" | "circuit")}
              className={inputClass}
            >
              <option value="superset">Superset</option>
              <option value="circuit">Circuit</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Rounds
            <input
              type="number"
              min={1}
              value={groupRounds}
              onChange={(e) => setGroupRounds(Math.max(1, Number(e.target.value) || 1))}
              className={`${inputClass} w-20`}
            />
          </label>
          <button
            type="button"
            onClick={group}
            className="rounded-md bg-[color:var(--series-exercise)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Group
          </button>
          <button type="button" onClick={() => setSelectedIds([])} className="text-xs text-ink-muted">
            Cancel selection
          </button>
        </div>
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
                {e.shared ? " (shared)" : ""}
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

      {items.some((i) => !i.block_id) && (
        <p className="text-xs text-ink-muted">
          Check 2 or more ungrouped exercises above to combine them into a superset or circuit.
        </p>
      )}
    </div>
  );
}

function UnitMoveButtons({
  disabledUp,
  disabledDown,
  onUp,
  onDown,
}: {
  disabledUp: boolean;
  disabledDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <>
      <button
        type="button"
        disabled={disabledUp}
        onClick={onUp}
        className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={disabledDown}
        onClick={onDown}
        className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary disabled:opacity-30"
      >
        ↓
      </button>
    </>
  );
}
