// Shared mm:ss (or h:mm:ss past an hour) formatting for the workout clock
// and set timers.
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// A finished session's total active time -- same started_at/total_paused_seconds
// math as the live WorkoutClock, just for a session that's no longer ticking
// (uses completed_at as the end point instead of "now").
export function sessionDurationSeconds(
  startedAt: string | null,
  completedAt: string | null,
  totalPausedSeconds: number | null,
): number {
  if (!startedAt || !completedAt) return 0;
  const raw = (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000 - (totalPausedSeconds ?? 0);
  return Math.max(0, Math.round(raw));
}
