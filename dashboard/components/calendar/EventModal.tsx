"use client";

import { useState } from "react";
import { createEvent, deleteEvent, updateEvent, type EventInput } from "@/lib/calendar-actions";
import type { CalendarEventRow } from "@/lib/calendar";

const REMINDER_OPTIONS = [
  { label: "No reminder", value: "" },
  { label: "15 minutes before", value: "15" },
  { label: "30 minutes before", value: "30" },
  { label: "1 hour before", value: "60" },
  { label: "1 day before", value: "1440" },
];

// Local <-> UTC conversion for <input type="datetime-local">, which
// wants/returns "YYYY-MM-DDTHH:mm" in the browser's own local time, not
// UTC -- the round-trip through Date here is what keeps the picker
// showing (and submitting) times in the viewer's own timezone.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

function defaultEnd(startIso: string): string {
  return new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
}

export function EventModal({
  event,
  assignableClients,
  fixedClientId,
  onClose,
  onSaved,
  onDeleted,
}: {
  event?: CalendarEventRow | null;
  // Coach's own dashboard: a picker over every client, or "personal"
  // (no client) if left unselected.
  assignableClients?: { id: string; name: string }[];
  // Coach viewing one specific client's page: no picker needed (there's
  // only one relevant client), but a new event still has to be shared
  // with *that* client, not silently become a personal block.
  fixedClientId?: string;
  onClose: () => void;
  onSaved: (event: CalendarEventRow) => void;
  onDeleted?: (eventId: string) => void;
}) {
  const isEdit = !!event;
  const initialStart = event?.start_time ?? defaultStart();
  const initialEnd = event?.end_time ?? defaultEnd(initialStart);

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startLocal, setStartLocal] = useState(toLocalInputValue(initialStart));
  const [endLocal, setEndLocal] = useState(toLocalInputValue(initialEnd));
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [reminder, setReminder] = useState(
    event?.reminder_minutes_before != null ? String(event.reminder_minutes_before) : "",
  );
  const [hasVideoCall, setHasVideoCall] = useState(event?.has_video_call ?? false);
  const [clientId, setClientId] = useState(event?.client_id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    const startTime = fromLocalInputValue(startLocal);
    const endTime = fromLocalInputValue(endLocal);
    if (new Date(endTime) <= new Date(startTime)) {
      setError("End time has to be after the start time.");
      return;
    }

    const input: EventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startTime,
      endTime,
      allDay,
      reminderMinutesBefore: reminder ? Number(reminder) : null,
      hasVideoCall,
      clientId: fixedClientId ?? (assignableClients ? clientId || null : undefined),
    };

    setSubmitting(true);
    setError(null);
    try {
      const saved = isEdit ? await updateEvent(event!.id, input) : await createEvent(input);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save event.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!event) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      onDeleted?.(event.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete event.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-md rounded-xl bg-surface p-5">
        {confirmingDelete ? (
          <>
            <h3 className="mb-2 text-sm font-semibold text-ink-primary">Delete this event?</h3>
            <p className="mb-4 text-sm text-ink-secondary">This can&apos;t be undone.</p>
            {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={submitting}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {submitting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="mb-3 text-sm font-semibold text-ink-primary">
              {isEdit ? "Edit event" : "New event"}
            </h3>

            <div className="flex flex-col gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
              />

              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs text-ink-secondary">
                  Starts
                  <input
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary outline-none"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-ink-secondary">
                  Ends
                  <input
                    type="datetime-local"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary outline-none"
                  />
                </label>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                All day
              </label>

              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (optional)"
                className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
              />

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
              />

              {assignableClients && (
                <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                  Client (optional -- leave blank for a personal block)
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
                  >
                    <option value="">None -- personal</option>
                    {assignableClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1 text-xs text-ink-secondary">
                Reminder
                <select
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                  className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
                >
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={hasVideoCall}
                  onChange={(e) => setHasVideoCall(e.target.checked)}
                />
                Add a video call link
              </label>
            </div>

            {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-4 flex items-center justify-between">
              {isEdit ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={submitting}
                  className="text-xs text-ink-muted hover:text-red-600 dark:hover:text-red-400"
                >
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={submitting}
                  className="rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
