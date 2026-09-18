"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchOpenSlots, submitBooking } from "@/lib/booking-public-actions";
import type { OpenSlot } from "@/lib/booking";

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WINDOW_DAYS = 7;

export function BookingScheduler({ coachId }: { coachId: string }) {
  const [rangeAnchor, setRangeAnchor] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<OpenSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OpenSlot | null>(null);

  const rangeEnd = useMemo(() => addDays(rangeAnchor, WINDOW_DAYS - 1), [rangeAnchor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOpenSlots(coachId, toDateInput(rangeAnchor), toDateInput(rangeEnd))
      .then((rows) => {
        if (!cancelled) setSlots(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load open times.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, rangeAnchor, rangeEnd]);

  const byDay = useMemo(() => {
    const groups = new Map<string, OpenSlot[]>();
    for (const slot of slots) {
      const key = new Date(slot.startTime).toDateString();
      const list = groups.get(key) ?? [];
      list.push(slot);
      groups.set(key, list);
    }
    return groups;
  }, [slots]);

  if (selected) {
    return (
      <BookingForm
        coachId={coachId}
        slot={selected}
        onCancel={() => setSelected(null)}
        onBooked={() => setSlots((prev) => prev.filter((s) => s.startTime !== selected.startTime))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRangeAnchor((d) => addDays(d, -WINDOW_DAYS))}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ‹ Previous
        </button>
        <span className="text-xs font-medium text-ink-primary">
          {rangeAnchor.toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
          {rangeEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => setRangeAnchor((d) => addDays(d, WINDOW_DAYS))}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          Next ›
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading open times…</p>
      ) : byDay.size === 0 ? (
        <p className="text-sm text-ink-muted">No open times in this range.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(byDay.entries()).map(([day, daySlots]) => (
            <div key={day}>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">
                {new Date(daySlots[0].startTime).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {daySlots.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    onClick={() => setSelected(slot)}
                    className="rounded-md border border-[color:var(--border-hairline)] px-2.5 py-1 text-xs text-ink-primary hover:bg-[color:var(--page-plane)]"
                  >
                    {new Date(slot.startTime).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSlotRange(slot: OpenSlot): string {
  const start = new Date(slot.startTime);
  const end = new Date(slot.endTime);
  return `${start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function BookingForm({
  coachId,
  slot,
  onCancel,
  onBooked,
}: {
  coachId: string;
  slot: OpenSlot;
  onCancel: () => void;
  onBooked: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Your name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitBooking({
        coachId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        bookerName: name.trim(),
        bookerEmail: email.trim() || undefined,
        bookerPhone: phone.trim() || undefined,
        title: title.trim() || undefined,
      });
      onBooked();
      setConfirmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book this time -- it may have just been taken.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Booked</h2>
        <p className="text-sm text-ink-secondary">{formatSlotRange(slot)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-secondary">{formatSlotRange(slot)}</p>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        type="email"
        className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What's this about? (optional)"
        className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
      />

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Booking…" : "Confirm booking"}
        </button>
      </div>
    </div>
  );
}
