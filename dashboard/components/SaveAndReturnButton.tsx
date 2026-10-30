"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Every edit on the pages this renders on (assigned workout/program
// exercise lists, via WorkoutExerciseListEditor's injected actions)
// already saves itself the moment it's made -- there's no separate
// "unsaved draft" state to flush here. This button is purely the
// standard "I'm done, confirm it, take me back" affordance: the button
// itself flips to a disabled "Saved" label as the confirmation (no
// separate checkmark element), then a return to wherever the coach came
// from (most often the calendar item they clicked) via the browser
// history entry rather than a fixed link, so the page they land back on
// keeps its own state (expanded panel, selected view/date) instead of a
// fresh mount.
export function SaveAndReturnButton({ label = "Done" }: { label?: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  function handleClick() {
    setSaved(true);
    setTimeout(() => router.back(), 700);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={saved}
      className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
    >
      {saved ? "Saved" : label}
    </button>
  );
}
