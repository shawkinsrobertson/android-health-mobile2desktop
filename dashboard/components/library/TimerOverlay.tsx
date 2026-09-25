"use client";

import { useActiveTimer } from "./ActiveTimerProvider";
import { formatClock } from "@/lib/time-format";

// Full-screen modal for the currently-active work or rest timer. Hidden
// (renders null) once minimized -- TimerBanner takes over then, reading
// from the same context, so the interval underneath never stops either way.
export function TimerOverlay() {
  const { timer, adjust, minimize, finish } = useActiveTimer();

  if (!timer || timer.minimized) return null;

  const isWork = timer.kind === "work";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/80 px-6">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-white/60">
          {isWork ? "Work" : "Rest"} -- Set {timer.setNumber}
        </div>
        <div className="mt-1 text-sm text-white/80">{timer.exerciseName}</div>
      </div>

      <div className="text-6xl font-semibold tabular-nums text-white">{formatClock(timer.remainingSeconds)}</div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => adjust(-15)}
          className="rounded-full border border-white/30 px-4 py-2 text-sm text-white"
        >
          − 15s
        </button>
        <button
          type="button"
          onClick={() => adjust(15)}
          className="rounded-full border border-white/30 px-4 py-2 text-sm text-white"
        >
          + 15s
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={minimize}
          className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white"
        >
          Minimize
        </button>
        <button
          type="button"
          onClick={finish}
          className="rounded-lg bg-[color:var(--accent)] px-6 py-2 text-sm font-medium text-white"
        >
          {isWork ? "Done" : "Skip"}
        </button>
      </div>
    </div>
  );
}
