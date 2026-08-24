// The Health Connect data types synced today (see supabase/migrations/0001_init.sql).
// Keys match table names 1:1 so they can be used directly once a client's
// synced rows are actually attributable to their account (Phase 6 -- the
// Android app still syncs under one shared identity today).
export const DATA_POINTS = [
  { key: "steps", label: "Steps" },
  { key: "heart_rate_samples", label: "Heart rate" },
  { key: "sleep_sessions", label: "Sleep" },
  { key: "exercise_sessions", label: "Workouts" },
  { key: "blood_oxygen", label: "Blood oxygen (SpO2)" },
  { key: "blood_pressure", label: "Blood pressure" },
  { key: "respiratory_rate", label: "Respiratory rate" },
] as const;

export const DATA_POINT_KEYS = DATA_POINTS.map((d) => d.key);

export function labelFor(key: string): string {
  return DATA_POINTS.find((d) => d.key === key)?.label ?? key;
}
