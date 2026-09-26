"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchEvents } from "@/lib/calendar-actions";
import { joinCalendarEvent } from "@/lib/calendar-call-actions";
import { disconnectGoogleCalendar, syncGoogleCalendar } from "@/lib/calendar-sync-actions";
import { BookingLinkControl } from "@/components/booking/BookingLinkControl";
import type { CalendarEventRow } from "@/lib/calendar";
import { addDays, rangeForView, startOfWeek } from "@/lib/calendar-grid";
import { AgendaList, DayList, MonthGrid, WeekGrid } from "./CalendarViews";
import { EventModal } from "./EventModal";

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

export function CalendarCard({
  scope,
  initialEvents,
  assignableClients,
  fixedClientId,
  title = "Calendar",
  googleSync,
  creatorHasGoogleConnection,
  booking,
}: {
  scope: { coachId: string } | { clientId: string };
  initialEvents: CalendarEventRow[];
  assignableClients?: { id: string; name: string }[];
  fixedClientId?: string;
  title?: string;
  googleSync?: GoogleSyncProps;
  // Whether the signed-in user (not necessarily this calendar's owner --
  // see EventModal's own prop of the same shape) has their own Google
  // Calendar connected, for the "also add to Google Calendar" checkbox.
  creatorHasGoogleConnection?: boolean;
  booking?: BookingProps;
}) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<View>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [events, setEvents] = useState(initialEvents);
  const [loading, setLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const range = useMemo(() => rangeForView(view, anchorDate), [view, anchorDate]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    fetchEvents(scope, range)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
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
    const now = new Date().toISOString();
    return [...initialEvents].filter((e) => e.end_time >= now).slice(0, 3);
  }, [initialEvents]);

  function upsertLocal(saved: CalendarEventRow) {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      return exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
    });
    setEditingEvent(null);
    setCreating(false);
  }

  function removeLocal(eventId: string) {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setEditingEvent(null);
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
      const rows = await fetchEvents(scope, range);
      setEvents(rows);
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
        className="w-full rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-left"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-primary">{title}</h2>
          <span className="text-xs text-ink-muted">Tap to expand ▾</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing coming up.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-ink-primary">{ev.title}</span>
                <span className="shrink-0 pl-2 text-xs text-ink-muted">
                  {new Date(ev.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm font-semibold text-ink-primary hover:text-ink-secondary"
        >
          {title} ▴
        </button>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
        >
          New event
        </button>
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

      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1">
          {(["agenda", "day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
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
            <button type="button" onClick={() => step(-1)} className="text-ink-secondary hover:text-ink-primary">
              ‹
            </button>
            <span className="text-xs font-medium text-ink-primary">{periodLabel()}</span>
            <button type="button" onClick={() => step(1)} className="text-ink-secondary hover:text-ink-primary">
              ›
            </button>
          </div>
        )}
      </div>

      {joinError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{joinError}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : view === "agenda" ? (
        <AgendaList events={events} onSelect={setEditingEvent} onJoin={handleJoin} />
      ) : view === "month" ? (
        <MonthGrid
          anchorDate={anchorDate}
          events={events}
          onSelectDay={(d) => {
            setAnchorDate(d);
            setView("day");
          }}
          onSelectEvent={setEditingEvent}
        />
      ) : view === "week" ? (
        <WeekGrid anchorDate={anchorDate} events={events} onSelectEvent={setEditingEvent} />
      ) : (
        <DayList anchorDate={anchorDate} events={events} onSelect={setEditingEvent} onJoin={handleJoin} />
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
    </div>
  );
}

