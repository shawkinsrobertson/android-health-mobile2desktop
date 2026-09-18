"use client";

import { useEffect, useRef, useState } from "react";

const OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let mins = 0; mins < 24 * 60; mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const period = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const label = `${h12}:${String(m).padStart(2, "0")} ${period}`;
    opts.push({ value, label });
  }
  return opts;
})();

function labelFor(value: string): string {
  return OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// A scrollable, typeable time picker in 30-minute increments. Typing
// filters the dropdown by substring match against the displayed label
// (e.g. "2:3" narrows to 2:30 AM/PM) like a normal combobox; picking an
// option, or an exact label match on Enter/blur, commits it -- anything
// else reverts the field to the last committed value.
export function TimeCombobox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => labelFor(value));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(labelFor(value));
  }, [value]);

  const filtered = OPTIONS.filter((o) => o.label.toLowerCase().includes(text.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setText(labelFor(value));
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, value]);

  function commit(newValue: string) {
    onChange(newValue);
    setText(labelFor(newValue));
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const exact = filtered.find((o) => o.label.toLowerCase() === text.trim().toLowerCase());
      const match = exact ?? filtered[0];
      if (match) commit(match.value);
      else {
        setText(labelFor(value));
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setText(labelFor(value));
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-[color:var(--border-hairline)] bg-surface py-1 text-sm shadow-lg">
          {filtered.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => commit(o.value)}
                className={`block w-full px-3 py-1 text-left hover:bg-[color:var(--page-plane)] ${
                  o.value === value ? "font-semibold text-[color:var(--series-steps)]" : "text-ink-primary"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
