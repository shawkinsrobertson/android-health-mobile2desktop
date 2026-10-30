"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface ExerciseOption {
  id: string;
  name: string;
  shared?: boolean;
}

// A type-ahead "contains" search over the exercise library, replacing a
// native <select> that became unusable once the library grew past what
// fits comfortably in a dropdown -- shaped like calendar/TimeCombobox.tsx
// (controlled input, absolute-positioned results list, click-outside-to-
// close), but committing a picked exercise's id into a hidden form field
// instead of a free-text value, so the surrounding <form action={...}>
// (addWorkoutExercise, or its assigned-workout equivalent) needs no
// changes beyond swapping the <select> out for this.
//
// No match for what's typed -> a "Create new exercise" row instead of an
// empty list, linking to the exercise-creation page with a `returnTo`
// (back to whichever workout/assignment this field lives on) and the
// typed text pre-filled as the new exercise's name.
export function ExerciseSearchField({
  exercises,
  name = "exercise_id",
  returnTo,
  className,
}: {
  exercises: ExerciseOption[];
  name?: string;
  returnTo: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = text.trim().toLowerCase();
  const filtered = query ? exercises.filter((e) => e.name.toLowerCase().includes(query)) : [];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function select(exercise: ExerciseOption) {
    setSelectedId(exercise.id);
    setText(exercise.name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedId ?? ""} />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // Any further typing invalidates a prior pick -- text and the
          // committed id must never drift apart, since the id (not the
          // text) is what actually gets submitted.
          setSelectedId(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search exercises…"
        className={className}
      />
      {open && query && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[color:var(--border-hairline)] bg-surface py-1 text-sm shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => select(e)}
                  className={`block w-full px-3 py-1.5 text-left hover:bg-[color:var(--page-plane)] ${
                    e.id === selectedId ? "font-semibold text-[color:var(--accent)]" : "text-ink-primary"
                  }`}
                >
                  {e.name}
                  {e.shared ? " (shared)" : ""}
                </button>
              </li>
            ))
          ) : (
            <li>
              <Link
                href={`/dashboard/library/exercises/new?returnTo=${encodeURIComponent(returnTo)}&name=${encodeURIComponent(text.trim())}`}
                className="block w-full px-3 py-1.5 text-left text-[color:var(--accent)] hover:bg-[color:var(--page-plane)]"
              >
                + Create new exercise &quot;{text.trim()}&quot;
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
