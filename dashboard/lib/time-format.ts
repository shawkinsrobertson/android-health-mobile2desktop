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

// "7h 30m" (or "45m" under an hour) for a duration given in decimal hours --
// used wherever a rounded-to-one-decimal "7.5h" previously hid how far off
// a reading actually was from what a wearable reported.
export function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
