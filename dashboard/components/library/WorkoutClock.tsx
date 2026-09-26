"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pauseWorkoutTimer, resumeWorkoutTimer, startWorkoutTimer, completeSession } from "@/app/client/sessions/actions";
import { formatClock } from "@/lib/time-format";

// Field names match the raw columns the session actions select and
// return (see app/client/sessions/actions.ts), rather than translating
// to camelCase for this one component.
interface TimerState {
  started_at: string | null;
  paused_at: string | null;
  total_paused_seconds: number;
}

function elapsedSeconds(state: TimerState, nowMs: number): number {
  if (!state.started_at) return 0;
  const started = new Date(state.started_at).getTime();
  const pausedNow = state.paused_at ? Math.max(0, Math.round((nowMs - new Date(state.paused_at).getTime()) / 1000)) : 0;
  const raw = Math.round((nowMs - started) / 1000) - state.total_paused_seconds - pausedNow;
  return Math.max(0, raw);
}

// Top-left running workout clock -- Start/Pause/Resume/Stop. Timer state
// (started_at/paused_at/total_paused_seconds) is persisted server-side
// (supabase/migrations/0010_session_sets_and_timers.sql) so it survives a
// refresh or the tab being closed mid-workout; this component just ticks
// a local display off that state between button presses.
export function WorkoutClock({
  assignedWorkoutId,
  sessionId,
  initialStartedAt,
  initialPausedAt,
  initialTotalPausedSeconds,
  completedAt,
}: {
  assignedWorkoutId: string;
  sessionId: string;
  initialStartedAt: string | null;
  initialPausedAt: string | null;
  initialTotalPausedSeconds: number;
  completedAt: string | null;
}) {
  const [state, setState] = useState<TimerState>({
    started_at: initialStartedAt,
    paused_at: initialPausedAt,
    total_paused_seconds: initialTotalPausedSeconds,
  });
  const [now, setNow] = useState(() => Date.now());
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const finished = !!completedAt;

  useEffect(() => {
    if (!state.started_at || state.paused_at || finished) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [state.started_at, state.paused_at, finished]);

  if (finished) return null;

  if (!state.started_at) {
    return (
      <form
        action={() => {
          startTransition(async () => {
            const result = await startWorkoutTimer(sessionId);
            if (result) setState(result);
          });
        }}
      >
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          Start Workout
        </button>
      </form>
    );
  }

  const paused = !!state.paused_at;
  const elapsed = elapsedSeconds(state, now);

  return (
    <div className="flex items-center justify-between rounded-lg border border-[color:var(--border-hairline)] bg-surface px-4 py-3">
      <span className="text-2xl font-semibold tabular-nums text-ink-primary">{formatClock(elapsed)}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = paused ? await resumeWorkoutTimer(sessionId) : await pauseWorkoutTimer(sessionId);
              if (result) setState(result);
            })
          }
          className="flex items-center gap-1.5 rounded-md border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingStop(true)}
          className="flex items-center gap-1.5 rounded-md border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
        >
          ■ Stop
        </button>
      </div>

      {confirmingStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-xl bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink-primary">End this workout?</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              You can still add notes and edit sets afterward.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingStop(false)}
                className="rounded-lg border border-[color:var(--border-hairline)] px-4 py-2 text-sm text-ink-secondary"
              >
                Cancel
              </button>
              <form
                action={() => {
                  const formData = new FormData();
                  startTransition(async () => {
                    await completeSession(assignedWorkoutId, sessionId, formData);
                    setConfirmingStop(false);
                    router.refresh();
                  });
                }}
              >
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  End & Save
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
