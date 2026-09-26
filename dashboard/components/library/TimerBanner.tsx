"use client";

import { useActiveTimer } from "./ActiveTimerProvider";
import { formatClock } from "@/lib/time-format";

// Fixed banner across the top of the screen when a work/rest timer is
// minimized -- tapping it brings TimerOverlay back up. Sits above the
// normal page content (the pages using this reserve top padding for it).
export function TimerBanner() {
  const { timer, restore } = useActiveTimer();

  if (!timer || !timer.minimized) return null;

  return (
    <button
      type="button"
      onClick={restore}
      className="fixed inset-x-0 top-0 z-40 flex w-full items-center justify-center gap-2 bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white"
    >
      <span className="uppercase tracking-wide">{timer.kind === "work" ? "Work" : "Rest"}</span>
      <span className="tabular-nums">{formatClock(timer.remainingSeconds)}</span>
      <span className="text-white/80">-- tap to expand</span>
    </button>
  );
}
