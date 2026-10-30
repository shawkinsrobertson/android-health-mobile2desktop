"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchCalendarItems, rescheduleAssignment, updateEvent } from "@/lib/calendar-actions";
import { joinCalendarEvent } from "@/lib/calendar-call-actions";
import { disconnectGoogleCalendar, syncGoogleCalendar } from "@/lib/calendar-sync-actions";
import { BookingLinkControl } from "@/components/booking/BookingLinkControl";
import type { CalendarEventRow } from "@/lib/calendar";
import { eventToItem, type CalendarItem } from "@/lib/calendar-items";
import { addDays, daysBetweenKeys, localDateKeyOf, rangeForView, shiftIsoByDays, startOfWeek } from "@/lib/calendar-grid";
import { AgendaList, DayList, MonthGrid, WeekGrid } from "./CalendarViews";
import { EventModal } from "./EventModal";
import { AssignScheduleModal } from "./AssignScheduleModal";

type View = "agenda" | "day" | "week" | "month";

// `ownAccountEmail` (even if null) marks "this is the signed-in user's own
// calendar" mode, which shows Connect/Disconnect; its absence means "viewing
// someone else's calendar" (a coach on a client's page), which only ever
// offers a plain "Sync now" against that client's own connection.
export interface GoogleSyncProps {
  targetProfileId: string;
  ownAccountEmail?: string | null;
  lastSyncedAt?: string | null;
}

// Only passed on the coach's own dashboard instance of CalendarCard --
// booking link/availability are account-level, not per-client, so the
// coach's per-client page and a client's own calendar never get this.
export interface BookingProps {
  bookingUrl: string | null;
  availabilityHref: string;
}

// The calendar's own "schedule everything" entry point (see
// AssignScheduleModal) -- only ever passed by a coach's per-client page
// (the one place both a library to assign from and a single target
// client both exist at once; the coach's own aggregate calendar has no
// single client to assign onto, and a client can't assign content to
// themselves).
export interface AssignEntryProps {
  workoutOptions: { id: string; name: string }[];
  programOptions: { id: string; name: string }[];
  documentOptions: { id: string; name: string }[];
  assignWorkout: (formData: FormData) => void | Promise<void>;
  assignProgram: (formData: FormData) => void | Promise<void>;
  assignDocument: (formData: FormData) => void | Promise<void>;
}

export function CalendarCard({
  scope,
  initialItems,
  assignableClients,
  fixedClientId,
  title = "Calendar",
  googleSync,
  creatorHasGoogleConnection,
  booking,
  assignEntry,
  initialView = "month",
  initialExpanded = false,
}: {
  scope: { coachId: string } | { clientId: string };
  initialItems: CalendarItem[];
  assignableClients?: { id: string; name: string }[];
  fixedClientId?: string;
  title?: string;
  googleSync?: GoogleSyncProps;
  // Whether the signed-in user (not necessarily this calendar's owner --
  // see EventModal's own prop of the same shape) has their own Google
  // Calendar connected, for the "also add to Google Calendar" checkbox.
  creatorHasGoogleConnection?: boolean;
  booking?: BookingProps;
  assignEntry?: AssignEntryProps;
  // Lets the new coach Dashboard page default straight to a week view,
  // already expanded, instead of every other call site's compact
  // "tap to expand, starting on month" teaser.
  initialView?: View;
  initialExpanded?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(initialExpanded);
  const [assigning, setAssigning] = useState(false);
  const [view, setView] = useState<View>(initialView);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // Fades in whichever content (teaser or full calendar) just mounted,
  // including on first render -- re-triggers every time `expanded` flips,
  // since swapping between the two is a full DOM subtree change, not a
  // simple resize, so there's no single persistent element to transition.
  // The reset to invisible has to happen in a *layout* effect, before the
  // browser paints -- a plain effect fires after paint, so the new
  // content's first frame would still show the stale `visible` value from
  // before the toggle (a one-frame flash to opaque before dipping to 0).
  useLayoutEffect(() => {
    setVisible(false);
  }, [expanded]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  const range = useMemo(() => rangeForView(view, anchorDate), [view, anchorDate]);

  useEffect(() => {
    if (!expanded) return;
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
  }, [expanded, range.start, range.end]);

  const upcoming = useMemo(() => {
    const now = new Date();
    const nowKey = now.toISOString().slice(0, 10);
    return [...initialItems]
      .filter((item) => {
        // A call's own end_time decides whether it's still upcoming;
        // every other kind has no time of day, just a day -- still
        // "upcoming" through the end of that day.
        if (item.kind === "call") return (item.endTime ?? "") >= now.toISOString();
        return item.date >= nowKey;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""))
      .slice(0, 3);
  }, [initialItems]);

  function upsertLocal(saved: CalendarEventRow) {
    const item = eventToItem(saved);
    setItems((prev) => {
      const exists = prev.some((i) => i.kind === "call" && i.id === item.id);
      return exists ? prev.map((i) => (i.kind === "call" && i.id === item.id ? item : i)) : [...prev, item];
    });
    setEditingEvent(null);
    setCreating(false);
  }

  function removeLocal(eventId: string) {
    setItems((prev) => prev.filter((i) => !(i.kind === "call" && i.id === eventId)));
    setEditingEvent(null);
  }

  // Click-to-edit/complete: a workout/document item navigates to the
  // same dedicated page this app already has for it -- a coach's own
  // (fixedClientId set, see below) full assignment editor already lets
  // them edit that client's exercise list in place (the capability the
  // user actually asked for), and a client's own already has its
  // start/submit flow -- rather than re-building either as a second,
  // calendar-only editor surface that would drift from the real one.
  // `fixedClientId` is this component's own existing signal for "a coach
  // is viewing one specific client's calendar" (set only by
  // app/dashboard/clients/[clientId]/page.tsx) vs. absent for a client
  // viewing their own -- scope.clientId alone can't tell these apart, but
  // this prop already does, so no new prop is needed just for this.
  function handleSelectItem(item: CalendarItem) {
    if (item.kind === "call" && item.event) {
      setEditingEvent(item.event);
      return;
    }
    if ((item.kind === "workout" || item.kind === "document") && item.assignmentId) {
      const base = fixedClientId ? `/dashboard/clients/${fixedClientId}/assigned` : "/client/assigned";
      const path = item.kind === "workout" ? `${base}/workouts/${item.assignmentId}` : `${base}/documents/${item.assignmentId}`;
      // The client's own document view lives one level up from "assigned"
      // (see app/client/documents/[assignedDocumentId]/page.tsx), unlike
      // every other case here -- the one exception to the base+kind shape.
      router.push(!fixedClientId && item.kind === "document" ? `/client/documents/${item.assignmentId}` : path);
      return;
    }
    if (item.kind === "check_in" && !fixedClientId) {
      // Always the current week's check-in (see lib/check-ins.ts's
      // getCurrentCheckIn) regardless of which occurrence pill was
      // clicked -- there's no per-occurrence check-in view anywhere in
      // this app today, matching how the client's own "due" tasks already
      // link to this same page.
      router.push("/client/check-in");
    }
    // A coach viewing a check-in occurrence has nothing to edit -- it's
    // virtual/template-driven with no per-occurrence row (see
    // lib/calendar-items.ts's listCheckInOccurrences) -- so this is a
    // deliberate no-op for that one case.
  }

  // Drag-and-drop's only mutation -- a workout/document moves via
  // reschedule_assignment (see lib/calendar-actions.ts); a call keeps its
  // own time-of-day and duration, just shifted onto the new day, via the
  // existing updateEvent. A check-in item is never draggable (see
  // CalendarViews.tsx's isDraggableKind), so it never reaches here.
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

  async function handleSync() {
    if (!googleSync) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { syncedCount } = await syncGoogleCalendar(googleSync.targetProfileId);
      const rows = await fetchCalendarItems(scope, range);
      setItems(rows);
      setSyncMessage(`Synced ${syncedCount} event${syncedCount === 1 ? "" : "s"}.`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      await disconnectGoogleCalendar();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Couldn't disconnect.");
    } finally {
      setSyncing(false);
    }
  }


  function periodLabel(): string {
    if (view === "day") {
      return anchorDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    }
    if (view === "week") {
      const start = startOfWeek(anchorDate);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    return anchorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function step(direction: 1 | -1) {
    if (view === "day") setAnchorDate((d) => addDays(d, direction));
    else if (view === "week") setAnchorDate((d) => addDays(d, 7 * direction));
    else setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + direction, 1));
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`w-full rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-left transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-primary">{title}</h2>
          <span className="text-xs text-ink-muted">Tap to expand ▾</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing coming up.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((item) => (
              <li key={`${item.kind}:${item.id}`} className="flex items-center justify-between text-sm">
                <span className="truncate text-ink-primary">
                  {item.completed && <span className="mr-1 text-[color:var(--success)]">✓</span>}
                  {item.title}
                </span>
                <span className="shrink-0 pl-2 text-xs text-ink-muted">
                  {new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </button>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm font-semibold text-ink-primary hover:text-ink-secondary"
        >
          {title} ▴
        </button>
        <div className="flex gap-1.5">
          {assignEntry && (
            <button
              type="button"
              onClick={() => setAssigning(true)}
              className="rounded-md border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-[color:var(--page-plane)]"
            >
              + Assign
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
          >
            New event
          </button>
        </div>
      </div>

      {googleSync && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {googleSync.ownAccountEmail !== undefined ? (
            googleSync.ownAccountEmail ? (
              <>
                <span className="text-ink-muted">
                  Connected as {googleSync.ownAccountEmail}
                  {googleSync.lastSyncedAt &&
                    ` · last synced ${new Date(googleSync.lastSyncedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}`}
                </span>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  className="text-[color:var(--accent)] hover:underline disabled:opacity-50"
                >
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={syncing}
                  className="text-ink-muted hover:underline disabled:opacity-50"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <a href="/api/calendar/google/start" className="text-[color:var(--accent)] hover:underline">
                Connect Google Calendar
              </a>
            )
          ) : (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="text-[color:var(--accent)] hover:underline disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
          {syncMessage && <span className="text-ink-muted">{syncMessage}</span>}
        </div>
      )}

      {booking && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <BookingLinkControl bookingUrl={booking.bookingUrl} />
          <Link href={booking.availabilityHref} className="text-[color:var(--accent)] hover:underline">
            Manage availability →
          </Link>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1">
          {(["agenda", "day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-2 text-xs font-medium ${
                view === v
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-ink-secondary hover:bg-[color:var(--page-plane)]"
              }`}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {view !== "agenda" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous period"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-secondary hover:text-ink-primary"
            >
              ‹
            </button>
            <span className="text-xs font-medium text-ink-primary">{periodLabel()}</span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next period"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-secondary hover:text-ink-primary"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {joinError && <p className="mb-2 text-xs text-danger">{joinError}</p>}
      {rescheduleError && <p className="mb-2 text-xs text-danger">{rescheduleError}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : view === "agenda" ? (
        <AgendaList items={items} onSelect={handleSelectItem} onJoin={handleJoin} />
      ) : view === "month" ? (
        <MonthGrid
          anchorDate={anchorDate}
          items={items}
          onSelectDay={(d) => {
            setAnchorDate(d);
            setView("day");
          }}
          onSelectItem={handleSelectItem}
          onReschedule={handleReschedule}
        />
      ) : view === "week" ? (
        <WeekGrid anchorDate={anchorDate} items={items} onSelectItem={handleSelectItem} onReschedule={handleReschedule} />
      ) : (
        <DayList anchorDate={anchorDate} items={items} onSelect={handleSelectItem} onJoin={handleJoin} />
      )}

      {(creating || editingEvent) && (
        <EventModal
          event={editingEvent}
          assignableClients={assignableClients}
          fixedClientId={fixedClientId}
          hasGoogleConnection={creatorHasGoogleConnection}
          onClose={() => {
            setCreating(false);
            setEditingEvent(null);
          }}
          onSaved={upsertLocal}
          onDeleted={removeLocal}
        />
      )}

      {assigning && assignEntry && (
        <AssignScheduleModal
          initialDate={localDateKeyOf(anchorDate)}
          workoutOptions={assignEntry.workoutOptions}
          programOptions={assignEntry.programOptions}
          documentOptions={assignEntry.documentOptions}
          assignWorkout={assignEntry.assignWorkout}
          assignProgram={assignEntry.assignProgram}
          assignDocument={assignEntry.assignDocument}
          onClose={() => setAssigning(false)}
        />
      )}
    </div>
  );
}

