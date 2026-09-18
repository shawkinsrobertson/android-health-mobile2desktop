"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchOpenSlots, submitBooking } from "@/lib/booking-public-actions";
import type { OpenSlot } from "@/lib/booking";
import { isSameDay, isSameMonth, monthGridDays, startOfDay, startOfMonth } from "@/lib/calendar-grid";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function BookingScheduler({ coachId }: { coachId: string }) {
  const [anchorMonth, setAnchorMonth] = useState(() => startOfMonth(new Date()));
  const [slots, setSlots] = useState<OpenSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<OpenSlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOpenSlots(coachId, toDateInput(anchorMonth), toDateInput(endOfMonth(anchorMonth)))
      .then((rows) => {
        if (cancelled) return;
        setSlots(rows);
        // Keep the current selection if it still has open times; otherwise
        // default to the first date in the month that does, so the slot
        // list on the right isn't empty on first load.
        setSelectedDate((prev) => {
          if (prev && rows.some((s) => isSameDay(new Date(s.startTime), prev))) return prev;
          const first = rows[0];
          return first ? new Date(first.startTime) : null;
        });
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
  }, [coachId, anchorMonth]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, OpenSlot[]>();
    for (const slot of slots) {
      const key = toDateInput(new Date(slot.startTime));
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return map;
  }, [slots]);

  const selectedDaySlots = selectedDate ? (slotsByDate.get(toDateInput(selectedDate)) ?? []) : [];

  if (selectedSlot) {
    return (
      <BookingForm
        coachId={coachId}
        slot={selectedSlot}
        onCancel={() => setSelectedSlot(null)}
        onBooked={() => setSlots((prev) => prev.filter((s) => s.startTime !== selectedSlot.startTime))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <div className="sm:w-1/2">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-ink-primary">
            {anchorMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setAnchorMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ›
          </button>
        </div>

        {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <BookingMonthGrid
          anchorDate={anchorMonth}
          slotsByDate={slotsByDate}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </div>

      <div className="sm:w-1/2">
        <p className="mb-2 text-xs font-medium text-ink-secondary">
          {selectedDate
            ? selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
            : "Pick a date"}
        </p>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : !selectedDate ? (
          <p className="text-sm text-ink-muted">No open times this month.</p>
        ) : selectedDaySlots.length === 0 ? (
          <p className="text-sm text-ink-muted">No open times this day.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {selectedDaySlots.map((slot) => (
              <button
                key={slot.startTime}
                type="button"
                onClick={() => setSelectedSlot(slot)}
                className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-2 text-left text-sm text-ink-primary hover:bg-[color:var(--page-plane)]"
              >
                {new Date(slot.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookingMonthGrid({
  anchorDate,
  slotsByDate,
  selectedDate,
  onSelectDate,
}: {
  anchorDate: Date;
  slotsByDate: Map<string, OpenSlot[]>;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const days = monthGridDays(anchorDate);
  const today = startOfDay(new Date());
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label} className="text-center text-xs font-medium text-ink-secondary">
            {label}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = toDateInput(day);
          const hasSlots = (slotsByDate.get(key)?.length ?? 0) > 0;
          const inMonth = isSameMonth(day, anchorDate);
          const isPast = day < today;
          const selected = !!selectedDate && isSameDay(day, selectedDate);
          const disabled = !inMonth || !hasSlots || isPast;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(day)}
              className={`aspect-square rounded-lg text-xs ${
                selected
                  ? "bg-[color:var(--series-steps)] text-white"
                  : disabled
                    ? "text-ink-muted opacity-40"
                    : "bg-[color:var(--page-plane)] text-ink-primary hover:bg-[color:var(--border-hairline)]"
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
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
