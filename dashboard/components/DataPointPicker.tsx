"use client";

import { useState } from "react";
import { DATA_POINTS } from "@/app/client/data-points";
import { updateTopDataPoints } from "@/app/client/actions";

const MAX_SELECTED = 3;

export function DataPointPicker({ initialSelected }: { initialSelected: string[] }) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [saved, setSaved] = useState(false);

  function toggle(key: string) {
    setSaved(false);
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, key];
    });
  }

  return (
    <form
      action={async (formData) => {
        await updateTopDataPoints(formData);
        setSaved(true);
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-xs text-ink-muted">
        Pick up to {MAX_SELECTED} -- these are what show up first on your dashboard.
      </p>
      <div className="flex flex-wrap gap-2">
        {DATA_POINTS.map((d) => {
          const checked = selected.includes(d.key);
          const disabled = !checked && selected.length >= MAX_SELECTED;
          return (
            <label
              key={d.key}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${
                checked
                  ? "border-[color:var(--series-steps)] bg-[color:var(--series-steps)] text-white"
                  : disabled
                    ? "cursor-not-allowed border-[color:var(--border-hairline)] text-ink-muted"
                    : "border-[color:var(--border-hairline)] text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <input
                type="checkbox"
                name="data_point"
                value={d.key}
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(d.key)}
                className="sr-only"
              />
              {d.label}
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="w-fit rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
        >
          Save
        </button>
        {saved && <span className="text-xs text-ink-muted">Saved.</span>}
      </div>
    </form>
  );
}
