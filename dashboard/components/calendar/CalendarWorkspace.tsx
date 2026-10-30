"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCalendarItems, rescheduleAssignment, updateEvent } from "@/lib/calendar-actions";
import { joinCalendarEvent } from "@/lib/calendar-call-actions";
import type { CalendarEventRow } from "@/lib/calendar";
import { eventToItem, type CalendarItem } from "@/lib/calendar-items";
import { daysBetweenKeys, rangeForView, shiftIsoByDays } from "@/lib/calendar-grid";
import type { CoachAvailability } from "@/lib/booking";
import { BookingLinkControl } from "@/components/booking/BookingLinkControl";
import { AvailabilityEditor } from "@/components/booking/AvailabilityEditor";
import { AgendaList, MonthGrid } from "./CalendarViews";
import { EventModal } from "./EventModal";

// The coach's expanded calendar view (app/dashboard/calendar) -- unlike
// the compact CalendarCard elsewhere, this is always-expanded and shows
// the month grid and an agenda list side by side instead of behind view
// tabs, since there's a full page's width to use here. Booking link and
// availability settings live in the same left column since they're the
// other two things this page's job is to expose together.
export function CalendarWorkspace({
  coachId,
  initialItems,
  assignableClients,
  creatorHasGoogleConnection,
  bookingUrl,
  initialAvailability,
}: {
  coachId: string;
  initialItems: CalendarItem[];
  assignableClients: { id: string; name: string }[];
  creatorHasGoogleConnection: boolean;
  bookingUrl: string | null;
  initialAvailability: CoachAvailability;
}) {
  const scope = useMemo(() => ({ coachId }), [coachId]);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState<Date | undefined>(undefined);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [editingAvailability, setEditingAvailability] = useState(false);
  const [availabilitySaved, setAvailabilitySaved] = useState(false);

  const range = useMemo(() => rangeForView("month", anchorDate), [anchorDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCalendarItems(scope, range)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  function upsertLocal(saved: CalendarEventRow) {
    const item = eventToItem(saved);
    setItems((prev) => {
      const exists = prev.some((i) => i.kind === "call" && i.id === item.id);
      return exists ? prev.map((i) => (i.kind === "call" && i.id === item.id ? item : i)) : [...prev, item];
    });
    setEditingEvent(null);
    setCreating(false);
    setCreateDate(undefined);
  }

  function removeLocal(eventId: string) {
    setItems((prev) => prev.filter((i) => !(i.kind === "call" && i.id === eventId)));
    setEditingEvent(null);
  }

  function handleSelectItem(item: CalendarItem) {
    if (item.kind === "call" && item.event) setEditingEvent(item.event);
  }

  // Same shape as CalendarCard's own handleReschedule -- see its comment.
  async function handleReschedule(item: CalendarItem, newDate: string) {
    setRescheduleError(null);
    const previousItems = items;
    setItems((prev) => prev.map((i) => (i.kind === item.kind && i.id === item.id ? { ...i, date: newDate } : i)));
    try {
      if (item.kind === "call" && item.event) {
        const deltaDays = daysBetweenKeys(item.date, newDate);
        const updated = await updateEvent(item.event.id, {
          title: item.event.title,
          description: item.event.description ?? undefined,
          location: item.event.location ?? undefined,
          startTime: shiftIsoByDays(item.event.start_time, deltaDays),
          endTime: shiftIsoByDays(item.event.end_time, deltaDays),
          allDay: item.event.all_day,
          reminderMinutesBefore: item.event.reminder_minutes_before,
          hasVideoCall: item.event.has_video_call,
        });
        upsertLocal(updated);
      } else if (item.assignmentId) {
        await rescheduleAssignment(item.assignmentId, newDate);
      }
    } catch (err) {
      setItems(previousItems);
      setRescheduleError(err instanceof Error ? err.message : "Couldn't move it to that day.");
    }
  }

  async function handleJoin(eventId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setJoinError(null);
    try {
      const { roomUrl, token } = await joinCalendarEvent(eventId);
      window.open(`${roomUrl}?t=${token}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Couldn't start the call.");
    }
  }

  function step(direction: 1 | -1) {
    setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + direction, 1));
  }

  function openCreateForDay(day: Date) {
    setCreateDate(day);
    setCreating(true);
  }

  function handleAvailabilitySaved() {
    setEditingAvailability(false);
    setAvailabilitySaved(true);
    setTimeout(() => setAvailabilitySaved(false), 3000);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-1">
        <div className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-primary">Booking link</h2>
          <BookingLinkControl bookingUrl={bookingUrl} />

          <button
            type="button"
            onClick={() => setEditingAvailability((v) => !v)}
            className="mt-3 text-xs text-[color:var(--accent)] hover:underline"
          >
            {editingAvailability ? "Hide availability settings" : "Edit availability"}
          </button>
          {availabilitySaved && <p className="mt-2 text-xs text-ink-secondary">Availability saved.</p>}

          {editingAvailability && (
            <div className="mt-3 border-t border-[color:var(--border-hairline)] pt-3">
              <AvailabilityEditor initial={initialAvailability} onSaved={handleAvailabilitySaved} />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-primary">This month</h2>
          {joinError && <p className="mb-2 text-xs text-danger">{joinError}</p>}
          {rescheduleError && <p className="mb-2 text-xs text-danger">{rescheduleError}</p>}
          <AgendaList items={items} onSelect={handleSelectItem} onJoin={handleJoin} />
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 lg:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-secondary hover:text-ink-primary"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-ink-primary">
              {anchorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-secondary hover:text-ink-primary"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateDate(undefined);
              setCreating(true);
            }}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            New event
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          <MonthGrid
            anchorDate={anchorDate}
            items={items}
            onSelectDay={openCreateForDay}
            onSelectItem={handleSelectItem}
            onReschedule={handleReschedule}
          />
        )}
      </div>

      {(creating || editingEvent) && (
        <EventModal
          event={editingEvent}
          assignableClients={assignableClients}
          hasGoogleConnection={creatorHasGoogleConnection}
          initialDate={createDate}
          onClose={() => {
            setCreating(false);
            setEditingEvent(null);
            setCreateDate(undefined);
          }}
          onSaved={upsertLocal}
          onDeleted={removeLocal}
        />
      )}
    </div>
  );
}
