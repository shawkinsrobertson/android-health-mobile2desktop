// Pure, presentational calendar view pieces shared between the compact
// CalendarCard (dashboard/client/client-detail pages) and the expanded
// CalendarWorkspace (the coach's full /dashboard/calendar page) -- both
// need the exact same month grid / agenda list rendering, just arranged
// differently around them.

import type { CalendarEventRow } from "@/lib/calendar";
import { isSameDay, isSameMonth, monthGridDays, weekDays } from "@/lib/calendar-grid";

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function eventTimeLabel(ev: CalendarEventRow): string {
  if (ev.all_day) return "All day";
  const start = new Date(ev.start_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const end = new Date(ev.end_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${start} – ${end}`;
}

export function EventRow({
  event,
  onSelect,
  onJoin,
}: {
  event: CalendarEventRow;
  onSelect: (e: CalendarEventRow) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <li
      onClick={() => onSelect(event)}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-[color:var(--page-plane)] p-3 text-sm hover:bg-[color:var(--border-hairline)]"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-ink-primary">{event.title}</p>
        <p className="text-xs text-ink-muted">{eventTimeLabel(event)}</p>
      </div>
      {event.has_video_call && (
        <button
          type="button"
          onClick={(e) => onJoin(event.id, e)}
          className="shrink-0 rounded-md bg-[color:var(--series-steps)] px-2 py-1 text-xs font-medium text-white"
        >
          Join
        </button>
      )}
    </li>
  );
}

export function AgendaList({
  events,
  onSelect,
  onJoin,
}: {
  events: CalendarEventRow[];
  onSelect: (e: CalendarEventRow) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
}) {
  const sorted = [...events].sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (sorted.length === 0) return <p className="text-sm text-ink-muted">Nothing on the calendar.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((ev) => (
        <EventRow key={ev.id} event={ev} onSelect={onSelect} onJoin={onJoin} />
      ))}
    </ul>
  );
}

export function DayList({
  anchorDate,
  events,
  onSelect,
  onJoin,
}: {
  anchorDate: Date;
  events: CalendarEventRow[];
  onSelect: (e: CalendarEventRow) => void;
  onJoin: (id: string, e: React.MouseEvent) => void;
}) {
  const dayEvents = events
    .filter((ev) => isSameDay(new Date(ev.start_time), anchorDate))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (dayEvents.length === 0) return <p className="text-sm text-ink-muted">Nothing this day.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {dayEvents.map((ev) => (
        <EventRow key={ev.id} event={ev} onSelect={onSelect} onJoin={onJoin} />
      ))}
    </ul>
  );
}

export function WeekGrid({
  anchorDate,
  events,
  onSelectEvent,
}: {
  anchorDate: Date;
  events: CalendarEventRow[];
  onSelectEvent: (e: CalendarEventRow) => void;
}) {
  const days = weekDays(anchorDate);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const dayEvents = events
          .filter((ev) => isSameDay(new Date(ev.start_time), day))
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        return (
          <div key={day.toISOString()} className="min-h-[7rem] rounded-lg bg-[color:var(--page-plane)] p-1.5">
            <p className="mb-1 text-center text-xs font-medium text-ink-secondary">
              {WEEKDAY_LABELS[day.getDay()]} {day.getDate()}
            </p>
            <div className="flex flex-col gap-1">
              {dayEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className="truncate rounded bg-[color:var(--series-steps)]/20 px-1 py-0.5 text-left text-[11px] text-ink-primary"
                >
                  {ev.title}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MonthGrid({
  anchorDate,
  events,
  onSelectDay,
  onSelectEvent,
}: {
  anchorDate: Date;
  events: CalendarEventRow[];
  onSelectDay: (d: Date) => void;
  onSelectEvent: (e: CalendarEventRow) => void;
}) {
  const days = monthGridDays(anchorDate);
  const today = new Date();
  return (
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
          const dayEvents = events
            .filter((ev) => isSameDay(new Date(ev.start_time), day))
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          const inMonth = isSameMonth(day, anchorDate);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[4.5rem] rounded-lg p-1 ${inMonth ? "bg-[color:var(--page-plane)]" : "opacity-40"}`}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className={`mb-1 text-xs ${
                  isSameDay(day, today) ? "font-bold text-[color:var(--series-steps)]" : "text-ink-secondary"
                }`}
              >
                {day.getDate()}
              </button>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onSelectEvent(ev)}
                    className="truncate rounded bg-[color:var(--series-steps)]/20 px-1 text-left text-[10px] text-ink-primary"
                  >
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="text-left text-[10px] text-ink-muted"
                  >
                    +{dayEvents.length - 2} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
