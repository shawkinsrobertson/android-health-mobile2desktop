"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { groupIntoUnits, type Unit as WorkoutUnit } from "@/lib/workout-blocks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ExerciseSearchField, type ExerciseOption } from "@/components/library/ExerciseSearchField";
import { DragHandleIcon } from "@/components/icons/DragHandleIcon";

// Same activation constraint as the calendar's own dnd-kit setup
// (components/calendar/CalendarViews.tsx) -- without it, PointerSensor
// starts a "drag" on any pointer movement at all, which eats ordinary
// clicks on the row's own buttons underneath.
function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

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

// The eight exercise/block mutations this editor drives, injected rather
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
  reorderUnits: (targetId: string, orderedUnitKeys: string[]) => Promise<void>;
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
  availableExercises,
  returnTo,
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
  availableExercises: ExerciseOption[];
  returnTo: string;
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
        <ExerciseSearchField
          exercises={availableExercises}
          returnTo={returnTo}
          initialId={item.exercise_id}
          initialName={item.exercise_name}
          className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary outline-none"
        />
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
  const sensors = useDragSensors();

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

  function handleUnitDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = units.findIndex((u) => u.key === active.id);
    const newIndex = units.findIndex((u) => u.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(units, oldIndex, newIndex).map((u) => u.key);
    startTransition(() => {
      actions.reorderUnits(targetId, reordered);
    });
  }

  function handleMemberDragEnd(members: WorkoutExerciseItem[], event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = members.findIndex((m) => m.id === active.id);
    const newIndex = members.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(members, oldIndex, newIndex);
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleUnitDragEnd}>
          <SortableContext items={units.map((u) => u.key)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {units.map((unit) => (
                <SortableItem key={unit.key} id={unit.key} disabled={isPending}>
                  {(handle) => (
                    <li>
                      {unit.type === "exercise" ? (
                        <div className="rounded-lg border border-[color:var(--border-hairline)] p-3">
                          <div className="mb-1 flex justify-end gap-1">
                            <DragHandle handle={handle} disabled={isPending} />
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
                            availableExercises={availableExercises}
                            returnTo={returnTo}
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
                              <DragHandle handle={handle} disabled={isPending} />
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

                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) => handleMemberDragEnd(unit.members, event)}
                          >
                            <SortableContext items={unit.members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                              <ul className="flex flex-col gap-2">
                                {unit.members.map((member) => (
                                  <SortableItem key={member.id} id={member.id} disabled={isPending}>
                                    {(memberHandle) => (
                                      <li className="rounded-md border border-[color:var(--border-hairline)] bg-surface p-2">
                                        <div className="mb-1 flex justify-end gap-1">
                                          <DragHandle handle={memberHandle} disabled={isPending} />
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
                                          availableExercises={availableExercises}
                                          returnTo={returnTo}
                                        />
                                      </li>
                                    )}
                                  </SortableItem>
                                ))}
                              </ul>
                            </SortableContext>
                          </DndContext>
                        </div>
                      )}
                    </li>
                  )}
                </SortableItem>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
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

type SortableHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

// Wraps one draggable row (a top-level unit, or a block member) in the
// DOM node dnd-kit needs a ref on, while handing the drag
// attributes/listeners back to the caller rather than attaching them
// here -- so only the small handle button is draggable, not a click
// anywhere on the row (which would fight with the Edit/Remove buttons
// right next to it).
function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (handle: SortableHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

function DragHandle({ handle, disabled }: { handle: SortableHandleProps; disabled?: boolean }) {
  return (
    <button
      type="button"
      {...handle.attributes}
      {...handle.listeners}
      disabled={disabled}
      aria-label="Drag to reorder"
      className="cursor-grab touch-none rounded-md border border-[color:var(--border-hairline)] px-2.5 py-2 text-ink-secondary disabled:cursor-not-allowed disabled:opacity-30 active:cursor-grabbing"
    >
      <DragHandleIcon className="h-4 w-4" />
    </button>
  );
}
