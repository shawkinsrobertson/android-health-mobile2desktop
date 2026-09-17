import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersonalRecord {
  exerciseName: string;
  weight: number;
  reps: string | null;
  achievedOn: string;
}

interface SessionRow {
  id: string;
  performed_on: string | null;
  completed_at: string | null;
}

interface SessionExerciseRow {
  id: string;
  session_id: string;
  assigned_workout_exercise_id: string;
}

interface SetRow {
  session_exercise_id: string;
  weight: string | null;
  reps: string | null;
}

// A PR is the heaviest weight ever logged for a given exercise name, across
// every completed session -- derived from the per-set logs rather than the
// manual "mark this set as a PR" checkbox already on
// workout_session_exercises.is_pr (that's a client's in-the-moment note to
// themselves, not an authoritative record; this is the computed one).
//
// `weight` on workout_session_sets is free-form text ("135", "BW", ...) --
// see 0010_session_sets_and_timers.sql -- so non-numeric entries are
// skipped rather than crashing the derivation. Grouped by exercise *name*
// (not source_library_exercise_id, which is nullable and can be null for a
// coach's one-off/custom exercise) so every assignment of "the same"
// exercise counts toward one record, matching how a client would think
// about it.
export async function getPersonalRecords(
  supabase: SupabaseClient,
  clientId: string,
): Promise<PersonalRecord[]> {
  const { data: sessionRows } = await supabase
    .from("workout_sessions")
    .select("id, performed_on, completed_at")
    .eq("client_id", clientId)
    .not("completed_at", "is", null);

  const sessions = (sessionRows ?? []) as SessionRow[];
  if (sessions.length === 0) return [];

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const sessionIds = sessions.map((s) => s.id);

  const { data: sessionExerciseRows } = await supabase
    .from("workout_session_exercises")
    .select("id, session_id, assigned_workout_exercise_id")
    .in("session_id", sessionIds)
    .eq("completed", true);

  const sessionExercises = (sessionExerciseRows ?? []) as SessionExerciseRow[];
  if (sessionExercises.length === 0) return [];

  const assignedExerciseIds = Array.from(
    new Set(sessionExercises.map((e) => e.assigned_workout_exercise_id)),
  );

  const { data: assignedExerciseRows } = await supabase
    .from("assigned_workout_exercises")
    .select("id, name")
    .in("id", assignedExerciseIds);

  const nameByAssignedId = new Map(
    ((assignedExerciseRows ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]),
  );

  const sessionExerciseIds = sessionExercises.map((e) => e.id);
  const { data: setRows } = await supabase
    .from("workout_session_sets")
    .select("session_exercise_id, weight, reps")
    .in("session_exercise_id", sessionExerciseIds);

  const sets = (setRows ?? []) as SetRow[];
  if (sets.length === 0) return [];

  const infoBySessionExerciseId = new Map(
    sessionExercises.map((e) => {
      const session = sessionById.get(e.session_id);
      return [
        e.id,
        {
          name: nameByAssignedId.get(e.assigned_workout_exercise_id) ?? "Exercise",
          date: session?.completed_at ?? session?.performed_on ?? "",
        },
      ] as const;
    }),
  );

  const bestByName = new Map<string, PersonalRecord>();

  for (const set of sets) {
    const info = infoBySessionExerciseId.get(set.session_exercise_id);
    if (!info) continue;

    const weight = parseWeight(set.weight);
    if (weight === null) continue;

    const key = info.name.trim().toLowerCase();
    const existing = bestByName.get(key);
    if (!existing || weight > existing.weight) {
      bestByName.set(key, {
        exerciseName: info.name.trim(),
        weight,
        reps: set.reps,
        achievedOn: info.date,
      });
    }
  }

  return Array.from(bestByName.values()).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

function parseWeight(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}
