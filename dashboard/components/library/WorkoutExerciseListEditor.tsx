"use client";

import { useState, useTransition } from "react";
import { groupIntoUnits, type Unit as WorkoutUnit } from "@/lib/workout-blocks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExerciseSearchField, type ExerciseOption } from "@/components/library/ExerciseSearchField";

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

// The nine exercise/block mutations this editor drives, injected rather
// than imported by name -- lets the exact same editor UI run against
// either a template workout's own template_components/
// template_component_groups (workouts/actions.ts) or a specific client's
// assigned copy of one (assigned/workouts/[assignedWorkoutId]/actions.ts),
// with the id passed through unchanged either way (a workout's own id, or
// that client's assignment id).
export interface WorkoutExerciseActions {
  add: (targetId: string, formData: FormData) => Promise<void>;
  update: (targetId: string, itemId: string, formData: FormData) => Promise<void>;
  remove: (targetId: string, itemId: string) => Promise<void>;
  reorder: (targetId: string, orderedIds: string[]) => Promise<void>;
  createBlock: (
    targetId: string,
    blockType: "superset" | "circuit",
    rounds: number,
    exerciseIds: string[],
  ) => Promise<void>;
  updateBlock: (targetId: string, blockId: string, formData: FormData) => Promise<void>;
  ungroupBlock: (targetId: string, blockId: string) => Promise<void>;
  deleteBlock: (targetId: string, blockId: string) => Promise<void>;
  moveUnit: (targetId: string, unitKey: string, direction: -1 | 1) => Promise<void>;
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
  targetId,
  actions,
  item,
  editing,
  onEdit,
  onCancelEdit,
  onRemove,
  removing,
  selectable,
  selected,
  onToggleSelected,
  isPending,
}: {
  targetId: string;
  actions: WorkoutExerciseActions;
  item: WorkoutExerciseItem;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  removing: boolean;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  isPending: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (editing) {
    return (
      <form
        action={async (formData: FormData) => {
          setSaving(true);
          await actions.update(targetId, item.id, formData);
          setSaving(false);
          setSaved(true);
          setTimeout(() => {
            setSaved(false);
            onCancelEdit();
          }, 600);
        }}
        className="flex flex-col gap-2"
      >
        <div className="text-sm font-medium text-ink-primary">{item.exercise_name}</div>
        <PrescriptionFields defaults={item} />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving || saved}
            className="rounded-md bg-[color:var(--accent)] px-2 py-1 text-xs text-white disabled:opacity-60"
          >
            {saved ? "Saved ✓" : saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onCancelEdit} disabled={saving || saved} className="text-xs text-ink-muted">
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
          className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-xs text-ink-secondary"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onRemove}
          className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-xs text-ink-secondary hover:text-danger disabled:opacity-60"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

export function WorkoutExerciseListEditor({
  targetId,
  actions,
  returnTo,
  items,
  blocks,
  availableExercises,
}: {
  targetId: string;
  actions: WorkoutExerciseActions;
  returnTo: string;
  items: WorkoutExerciseItem[];
  blocks: WorkoutBlock[];
  availableExercises: ExerciseOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupType, setGroupType] = useState<"superset" | "circuit">("superset");
  const [groupRounds, setGroupRounds] = useState(3);
  type RowAction = { kind: "remove-exercise" | "ungroup-block" | "delete-block"; id: string };
  const [confirmAction, setConfirmAction] = useState<RowAction | null>(null);
  const [pendingAction, setPendingAction] = useState<RowAction | null>(null);

  const units = groupIntoUnits(items, blocks);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function runConfirmedAction() {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    setConfirmAction(null);
    setPendingAction({ kind, id });
    startTransition(() => {
      if (kind === "remove-exercise") actions.remove(targetId, id);
      else if (kind === "ungroup-block") actions.ungroupBlock(targetId, id);
      else actions.deleteBlock(targetId, id);
    });
  }

  function moveUnit(key: string, direction: -1 | 1) {
    startTransition(() => {
      actions.moveUnit(targetId, key, direction);
    });
  }

  function moveWithinBlock(members: WorkoutExerciseItem[], itemId: string, direction: -1 | 1) {
    const idx = members.findIndex((m) => m.id === itemId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= members.length) return;
    const reordered = [...members];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    startTransition(() => {
      actions.reorder(targetId, reordered.map((m) => m.id));
    });
  }

  function group() {
    if (selectedIds.length < 2) return;
    startTransition(() => {
      actions.createBlock(targetId, groupType, groupRounds, selectedIds);
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
                    targetId={targetId}
                    actions={actions}
                    item={unit.item}
                    editing={editingId === unit.item.id}
                    onEdit={() => setEditingId(unit.item.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onRemove={() => setConfirmAction({ kind: "remove-exercise", id: unit.item.id })}
                    removing={pendingAction?.kind === "remove-exercise" && pendingAction.id === unit.item.id}
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
                      <span className="rounded-full bg-[color:var(--series-exercise)]/20 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-[color:var(--series-exercise)]">
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
                        className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-xs text-ink-secondary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setConfirmAction({ kind: "ungroup-block", id: unit.block.id })}
                        className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-xs text-ink-secondary disabled:opacity-60"
                      >
                        {pendingAction?.kind === "ungroup-block" && pendingAction.id === unit.block.id
                          ? "Ungrouping…"
                          : "Ungroup"}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setConfirmAction({ kind: "delete-block", id: unit.block.id })}
                        className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-xs text-ink-secondary hover:text-danger disabled:opacity-60"
                      >
                        {pendingAction?.kind === "delete-block" && pendingAction.id === unit.block.id
                          ? "Deleting…"
                          : "Delete"}
                      </button>
                    </div>
                  </div>

                  {editingBlockId === unit.block.id && (
                    <form
                      action={async (formData: FormData) => {
                        await actions.updateBlock(targetId, unit.block.id, formData);
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
                      <button type="submit" className="rounded-md bg-[color:var(--accent)] px-2 py-1 text-xs text-white">
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
                          targetId={targetId}
                          actions={actions}
                          item={member}
                          editing={editingId === member.id}
                          onEdit={() => setEditingId(member.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onRemove={() => setConfirmAction({ kind: "remove-exercise", id: member.id })}
                          removing={pendingAction?.kind === "remove-exercise" && pendingAction.id === member.id}
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

      <form
        action={actions.add.bind(null, targetId)}
        className="flex flex-col gap-2 rounded-lg border border-dashed border-[color:var(--border-hairline)] p-3"
      >
        <div className="text-xs font-medium text-ink-secondary">Add exercise</div>
        <ExerciseSearchField
          exercises={availableExercises}
          returnTo={returnTo}
          className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary outline-none"
        />
        <PrescriptionFields />
        <button
          type="submit"
          className="w-fit rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
        >
          Add
        </button>
      </form>

      {items.some((i) => !i.block_id) && (
        <p className="text-xs text-ink-muted">
          Check 2 or more ungrouped exercises above to combine them into a superset or circuit.
        </p>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.kind === "remove-exercise"
            ? "Remove this exercise?"
            : confirmAction?.kind === "ungroup-block"
              ? "Ungroup this block?"
              : "Delete this block?"
        }
        body={
          confirmAction?.kind === "remove-exercise"
            ? "This can't be undone."
            : confirmAction?.kind === "ungroup-block"
              ? "Its exercises stay in the workout as standalone exercises."
              : "This deletes the block and every exercise in it. This can't be undone."
        }
        confirmLabel={
          confirmAction?.kind === "remove-exercise"
            ? "Remove"
            : confirmAction?.kind === "ungroup-block"
              ? "Ungroup"
              : "Delete"
        }
        destructive={confirmAction?.kind !== "ungroup-block"}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
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
        className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-xs text-ink-secondary disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={disabledDown}
        onClick={onDown}
        className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-xs text-ink-secondary disabled:opacity-30"
      >
        ↓
      </button>
    </>
  );
}
