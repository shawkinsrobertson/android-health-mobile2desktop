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
