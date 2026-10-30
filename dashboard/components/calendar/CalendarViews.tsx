// Pure, presentational calendar view pieces shared between the compact
// CalendarCard (dashboard/client/client-detail pages) and the expanded
// CalendarWorkspace (the coach's full /dashboard/calendar page) -- both
// need the exact same month grid / agenda list rendering, just arranged
// differently around them.

import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { CalendarItem, CalendarItemKind } from "@/lib/calendar-items";
import { isSameMonth, localDateKeyOf, monthGridDays, weekDays } from "@/lib/calendar-grid";

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A short label distinguishing kinds at a glance, since workout/document/
// check_in items all render as plain pills with no time -- "Workout",
// "Document", "Check-in" aren't shown on a call (its own time label
// already says enough, matching this row's pre-existing look).
const KIND_LABELS: Record<Exclude<CalendarItemKind, "call">, string> = {
  workout: "Workout",
  document: "Document",
  check_in: "Check-in",
};

export function itemTimeLabel(item: CalendarItem): string {
  if (item.kind !== "call") return KIND_LABELS[item.kind];
  if (item.allDay || !item.startTime || !item.endTime) return "All day";
  const start = new Date(item.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const end = new Date(item.endTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${start} – ${end}`;
}

export function ItemRow({
  item,
  onSelect,
  onJoin,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <li
      onClick={() => onSelect(item)}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-[color:var(--page-plane)] p-3 text-sm hover:bg-[color:var(--border-hairline)]"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-ink-primary">
          {item.completed && <span className="mr-1 text-[color:var(--success)]">✓</span>}
          {item.title}
        </p>
        <p className="text-xs text-ink-muted">{itemTimeLabel(item)}</p>
      </div>
      {item.kind === "call" && item.hasVideoCall && (
        <button
          type="button"
          onClick={(e) => onJoin(item.id, e)}
          className="shrink-0 rounded-md bg-[color:var(--accent)] px-2 py-1 text-xs font-medium text-white"
        >
          Join
        </button>
      )}
    </li>
  );
}

export function AgendaList({
  items,
  onSelect,
  onJoin,
}: {
  items: CalendarItem[];
  onSelect: (item: CalendarItem) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
}) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  if (sorted.length === 0) return <p className="text-sm text-ink-muted">Nothing on the calendar.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((item) => (
        <ItemRow key={`${item.kind}:${item.id}`} item={item} onSelect={onSelect} onJoin={onJoin} />
      ))}
    </ul>
  );
}

export function DayList({
  anchorDate,
  items,
  onSelect,
  onJoin,
}: {
  anchorDate: Date;
  items: CalendarItem[];
  onSelect: (item: CalendarItem) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
}) {
  const key = localDateKeyOf(anchorDate);
  const dayItems = items
    .filter((item) => item.date === key)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  if (dayItems.length === 0) return <p className="text-sm text-ink-muted">Nothing this day.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {dayItems.map((item) => (
        <ItemRow key={`${item.kind}:${item.id}`} item={item} onSelect={onSelect} onJoin={onJoin} />
      ))}
    </ul>
  );
}

// Solid background per kind for the grid pills, white text for contrast --
// a Google-Calendar-style colored chip, not a faint tint (an arbitrary-
// value opacity modifier like `/20` on a bare hex custom property is also
// too subtle to read against this app's dark-mode cell background even
// when it does render). Calls keep the pre-existing accent color; the
// three new kinds get their own semantic/series color so a day cell with
// a mix of items reads at a glance, matching the color tokens this app
// already has (WorkoutExerciseListEditor uses --series-exercise the same
// way for its superset/circuit framing).
const KIND_TINT: Record<CalendarItemKind, string> = {
  call: "bg-[color:var(--accent)]",
  workout: "bg-[color:var(--series-exercise)]",
  document: "bg-[color:var(--info)]",
  check_in: "bg-[color:var(--warning)]",
};

export function ItemPill({ item, onSelect }: { item: CalendarItem; onSelect: (item: CalendarItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      // block + w-full + min-w-0 are all required for `truncate` to
      // actually clip text instead of letting the button's intrinsic
      // content width push past (and visually bleed into) the next grid
      // cell -- a plain inline button has no definite width for
      // text-overflow:ellipsis to clip against, and a grid/flex item's
      // default min-width:auto lets it overflow its track instead of
      // shrinking to fit.
      className={`block w-full min-w-0 truncate rounded px-1.5 py-0.5 text-left text-xs text-white ${KIND_TINT[item.kind]}`}
    >
      {item.completed && <span className="mr-0.5">✓</span>}
      {item.title}
    </button>
  );
}

// A check-in occurrence has no row of its own to move -- its day comes
// straight from check_in_templates.day_of_week, not a per-occurrence
// date -- so it's the one kind that never drags.
function isDraggableKind(kind: CalendarItemKind): boolean {
  return kind !== "check_in";
}

// Wraps ItemPill as a dnd-kit drag source when its kind supports being
// rescheduled this way; a plain ItemPill otherwise. `id` doubles as the
// DragEndEvent payload's own id, reparsed by the caller's onReschedule.
function DraggableItemPill({ item, onSelect }: { item: CalendarItem; onSelect: (item: CalendarItem) => void }) {
  const id = `${item.kind}:${item.id}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: { item } });
  if (!isDraggableKind(item.kind)) return <ItemPill item={item} onSelect={onSelect} />;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        touchAction: "none",
      }}
      className="w-full min-w-0 cursor-grab active:cursor-grabbing"
    >
      <ItemPill item={item} onSelect={onSelect} />
    </div>
  );
}

// A grid day cell as a dnd-kit drop target, `id` the same "YYYY-MM-DD"
// key DragEndEvent.over.id resolves to, so a drop handler never needs to
// re-derive it from a Date.
function DroppableDayCell({
  id,
  className,
  children,
}: {
  id: string;
  className: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "ring-2 ring-[color:var(--accent)]" : ""}`}>
      {children}
    </div>
  );
}

// Both grids' own onDragEnd -- resolves the dragged item and the day it
// was dropped on, then hands both to the caller's onReschedule (which
// decides what to actually do: reschedule_assignment for a workout/
// document, updateEvent for a call -- see CalendarCard/CalendarWorkspace).
// A drop outside any cell, or back onto its own day, is a no-op.
function makeDragEndHandler(onReschedule: (item: CalendarItem, newDate: string) => void) {
  return (event: DragEndEvent) => {
    const overId = event.over?.id;
    const item = event.active.data.current?.item as CalendarItem | undefined;
    if (!overId || !item || item.date === overId) return;
    onReschedule(item, String(overId));
  };
}

export function WeekGrid({
  anchorDate,
  items,
  onSelectItem,
  onReschedule,
}: {
  anchorDate: Date;
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
  // Omit to render a read-only grid (no drag-and-drop) -- the client's
  // own dashboard still wants to see its schedule even though only a
  // coach's per-client view and the client themself can reschedule, and
  // both of those already pass this.
  onReschedule?: (item: CalendarItem, newDate: string) => void;
}) {
  const days = weekDays(anchorDate);
  const handleDragEnd = makeDragEndHandler(onReschedule ?? (() => {}));
  const grid = (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const key = localDateKeyOf(day);
        const dayItems = items
          .filter((item) => item.date === key)
          .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
        return (
          <DroppableDayCell
            key={key}
            id={key}
            className="min-h-[7rem] min-w-0 overflow-hidden rounded-lg bg-[color:var(--page-plane)] p-1.5"
          >
            <p className="mb-1 text-center text-xs font-medium text-ink-secondary">
              {WEEKDAY_LABELS[day.getDay()]} {day.getDate()}
            </p>
            <div className="flex flex-col gap-1">
              {dayItems.map((item) =>
                onReschedule ? (
                  <DraggableItemPill key={`${item.kind}:${item.id}`} item={item} onSelect={onSelectItem} />
                ) : (
                  <ItemPill key={`${item.kind}:${item.id}`} item={item} onSelect={onSelectItem} />
                ),
              )}
            </div>
          </DroppableDayCell>
        );
      })}
    </div>
  );
  return onReschedule ? <DndContext onDragEnd={handleDragEnd}>{grid}</DndContext> : grid;
}

export function MonthGrid({
  anchorDate,
  items,
  onSelectDay,
  onSelectItem,
  onReschedule,
}: {
  anchorDate: Date;
  items: CalendarItem[];
  onSelectDay: (d: Date) => void;
  onSelectItem: (item: CalendarItem) => void;
  onReschedule?: (item: CalendarItem, newDate: string) => void;
}) {
  const days = monthGridDays(anchorDate);
  const today = new Date();
  const handleDragEnd = makeDragEndHandler(onReschedule ?? (() => {}));
  const grid = (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label} className="text-center text-xs font-medium text-ink-secondary">
            {label}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const key = localDateKeyOf(day);
          const dayItems = items
            .filter((item) => item.date === key)
            .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
          const inMonth = isSameMonth(day, anchorDate);
          return (
            <DroppableDayCell
              key={key}
              id={key}
              className={`min-h-[4.5rem] min-w-0 overflow-hidden rounded-lg p-1 ${inMonth ? "bg-[color:var(--page-plane)]" : "opacity-40"}`}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className={`mb-1 text-xs ${
                  key === localDateKeyOf(today) ? "font-bold text-[color:var(--accent)]" : "text-ink-secondary"
                }`}
              >
                {day.getDate()}
              </button>
              <div className="flex flex-col gap-0.5">
                {dayItems.slice(0, 2).map((item) =>
                  onReschedule ? (
                    <DraggableItemPill key={`${item.kind}:${item.id}`} item={item} onSelect={onSelectItem} />
                  ) : (
                    <ItemPill key={`${item.kind}:${item.id}`} item={item} onSelect={onSelectItem} />
                  ),
                )}
                {dayItems.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="text-left text-xs text-ink-muted"
                  >
                    +{dayItems.length - 2} more
                  </button>
                )}
              </div>
            </DroppableDayCell>
          );
        })}
      </div>
    </div>
  );
  return onReschedule ? <DndContext onDragEnd={handleDragEnd}>{grid}</DndContext> : grid;
}
