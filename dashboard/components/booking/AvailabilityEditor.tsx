"use client";

import { useState } from "react";
import { saveAvailability } from "@/lib/booking-actions";
import { TimeCombobox } from "@/components/calendar/TimeCombobox";
import type { AvailabilityDay, CoachAvailability, TimeBlock } from "@/lib/booking";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function defaultBlock(): TimeBlock {
  return { start: "09:00", end: "17:00" };
}

// Embedded in CalendarWorkspace's left column, not a standalone page --
// onSaved is how the caller reacts to a successful save (e.g. collapsing
// the editor back down), since there's no separate page to navigate away
// from anymore.
export function AvailabilityEditor({
  initial,
  onSaved,
}: {
  initial: CoachAvailability;
  onSaved: () => void;
}) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [days, setDays] = useState<AvailabilityDay[]>(initial.days);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDay(dayOfWeek: number, patch: Partial<AvailabilityDay>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
  }

  function updateBlock(dayOfWeek: number, index: number, patch: Partial<TimeBlock>) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? { ...d, timeBlocks: d.timeBlocks.map((b, i) => (i === index ? { ...b, ...patch } : b)) }
          : d,
      ),
    );
  }

  function addBlock(dayOfWeek: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, timeBlocks: [...d.timeBlocks, defaultBlock()] } : d,
      ),
    );
  }

  function removeBlock(dayOfWeek: number, index: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek ? { ...d, timeBlocks: d.timeBlocks.filter((_, i) => i !== index) } : d,
      ),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveAvailability(timezone, days);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-1 text-xs text-ink-secondary">
        Timezone
        <input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/Denver"
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
        />
      </label>

      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <div
            key={day.dayOfWeek}
            className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-ink-primary">
                <input
                  type="checkbox"
                  checked={day.isAvailable}
                  onChange={(e) => updateDay(day.dayOfWeek, { isAvailable: e.target.checked })}
                />
                {DAY_LABELS[day.dayOfWeek]}
              </label>
              {day.isAvailable && (
                <button
                  type="button"
                  onClick={() => addBlock(day.dayOfWeek)}
                  className="text-xs text-[color:var(--accent)] hover:underline"
                >
                  + Add time block
                </button>
              )}
            </div>

            {day.isAvailable && (
              <div className="flex flex-col gap-2">
                {day.timeBlocks.length === 0 ? (
                  <p className="text-xs text-ink-muted">No time blocks yet -- add one above.</p>
                ) : (
                  day.timeBlocks.map((block, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TimeCombobox
                        value={block.start}
                        onChange={(t) => updateBlock(day.dayOfWeek, i, { start: t })}
                        className="w-24 rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary outline-none"
                      />
                      <span className="text-xs text-ink-muted">to</span>
                      <TimeCombobox
                        value={block.end}
                        onChange={(t) => updateBlock(day.dayOfWeek, i, { end: t })}
                        className="w-24 rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeBlock(day.dayOfWeek, i)}
                        className="text-xs text-ink-muted hover:text-red-600 dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-fit rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save availability"}
      </button>
    </div>
  );
}
