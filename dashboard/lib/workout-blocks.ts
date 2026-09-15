// Shared grouping logic for supersets/circuits (see
// supabase/migrations/0008_workout_blocks.sql) -- used by both the coach's
// editor (components/library/WorkoutExerciseListEditor.tsx) and the
// read-only assigned-workout views (components/library/AssignedExerciseList.tsx).
//
// A block's position in the rendered sequence is wherever its earliest
// member's order_index falls -- grouping isn't required to be contiguous
// in storage (see the migration's header comment), so this always
// re-derives the correct order rather than assuming members sit next to
// each other.

export interface BlockGroupable {
  id: string;
  block_id: string | null;
  order_index: number;
}

export interface BlockLike {
  id: string;
}

export type Unit<TItem, TBlock> =
  | { type: "exercise"; key: string; item: TItem }
  | { type: "block"; key: string; block: TBlock; members: TItem[] };

export function groupIntoUnits<TItem extends BlockGroupable, TBlock extends BlockLike>(
  items: TItem[],
  blocks: TBlock[],
): Unit<TItem, TBlock>[] {
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const grouped = new Map<string, { minOrder: number; unit: Unit<TItem, TBlock> }>();

  for (const item of items) {
    if (item.block_id && blockById.has(item.block_id)) {
      const key = `block:${item.block_id}`;
      const existing = grouped.get(key);
      if (existing && existing.unit.type === "block") {
        existing.unit.members.push(item);
        existing.minOrder = Math.min(existing.minOrder, item.order_index);
      } else {
        grouped.set(key, {
          minOrder: item.order_index,
          unit: { type: "block", key, block: blockById.get(item.block_id)!, members: [item] },
        });
      }
    } else {
      const key = `exercise:${item.id}`;
      grouped.set(key, { minOrder: item.order_index, unit: { type: "exercise", key, item } });
    }
  }

  for (const { unit } of grouped.values()) {
    if (unit.type === "block") unit.members.sort((a, b) => a.order_index - b.order_index);
  }

  return [...grouped.values()].sort((a, b) => a.minOrder - b.minOrder).map((g) => g.unit);
}
