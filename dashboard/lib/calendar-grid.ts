// Pure date-math helpers for the calendar UI's month/week/day/agenda
// views -- hand-rolled rather than a dependency, matching this
// codebase's preference for owning simple date/aggregation logic in TS
// (see lib/queries.ts's overlap-resolution/prorate helpers for the same
// philosophy) over pulling in a calendar-grid library for what's, at
// this scope, plain arithmetic.

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Sunday-start, matching coach_availability's day_of_week convention
// (0 = Sunday .. 6 = Saturday).
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// 42 cells (6 weeks) covering the full month plus leading/trailing days
// from adjacent months, so the grid is always a complete, rectangular
// set of weeks regardless of which day of the week the month starts on.
export function monthGridDays(monthAnchor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(monthAnchor));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekDays(weekAnchor: Date): Date[] {
  const start = startOfWeek(weekAnchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "YYYY-MM-DD" for one of this file's own grid-day Date objects (built
// from local y/m/d components, e.g. monthGridDays/weekDays) -- matches
// CalendarItem.date's own key shape (lib/calendar-items.ts) so grid cells
// can compare by plain string equality instead of re-parsing a Date.
export function localDateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Whole days between two "YYYY-MM-DD" keys -- used when a call is
// dragged to a new day, to shift its start/end instants by the same
// number of days rather than resetting their time-of-day.
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00Z`);
  const to = new Date(`${toKey}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 3_600_000));
}

export function shiftIsoByDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// The date range (as ISO strings, half-open [start, end)) a given view
// needs events fetched for -- matches lib/calendar.ts's listEvents
// range shape.
export function rangeForView(
  view: "agenda" | "day" | "week" | "month",
  anchorDate: Date,
): { start: string; end: string } {
  if (view === "day") {
    const start = startOfDay(anchorDate);
    return { start: start.toISOString(), end: addDays(start, 1).toISOString() };
  }
  if (view === "week") {
    const start = startOfWeek(anchorDate);
    return { start: start.toISOString(), end: addDays(start, 7).toISOString() };
  }
  // "month" and "agenda" (a scrollable list) both use the same
  // 6-week grid window, so switching between them doesn't need a
  // fresh fetch.
  const days = monthGridDays(anchorDate);
  return { start: days[0].toISOString(), end: addDays(days[days.length - 1], 1).toISOString() };
}
