import type { SupabaseClient } from "@supabase/supabase-js";

// Lazily seeds a session's per-exercise logging rows the first time its
// page is opened -- not a Server Action (no client ever calls this
// directly), just a plain helper called from the session pages' Server
// Components before rendering. Idempotent: only inserts what's missing,
// so re-visiting the page never duplicates rows.
//
// Each exercise gets one workout_session_exercises row (completed/PR/
// notes), and workout_session_sets pre-populated from the prescribed
// sets/reps/duration/weight_note/rest_seconds -- a blank table would make
// every session start from nothing even though the coach already told the
// client roughly what to expect; editable from there.

export interface AssignedExercisePrescription {
  id: string;
  sets: number | null;
  reps: string | null;
  prescription_type: "reps" | "time";
  duration_seconds: number | null;
  weight_note: string | null;
  rest_seconds: number | null;
}

export interface SessionExerciseRow {
  id: string;
  assigned_workout_exercise_id: string;
  completed: boolean;
  is_pr: boolean;
  notes: string | null;
}

export interface SessionSetRow {
  id: string;
  set_number: number;
  reps: string | null;
  duration_seconds: number | null;
  weight: string | null;
  rest_seconds: number | null;
}

export async function ensureSessionExercises(
  supabase: SupabaseClient,
  sessionId: string,
  clientId: string,
  coachId: string,
  exercises: AssignedExercisePrescription[],
): Promise<{
  exerciseRows: Record<string, SessionExerciseRow>;
  setsByExercise: Record<string, SessionSetRow[]>;
}> {
  const { data: existingExercises } = await supabase
    .from("workout_session_exercises")
    .select("id, assigned_workout_exercise_id, completed, is_pr, notes")
    .eq("session_id", sessionId);

  const exerciseRows: Record<string, SessionExerciseRow> = {};
  for (const row of (existingExercises ?? []) as SessionExerciseRow[]) {
    exerciseRows[row.assigned_workout_exercise_id] = row;
  }

  const missing = exercises.filter((e) => !exerciseRows[e.id]);
  if (missing.length > 0) {
    const { data: inserted } = await supabase
      .from("workout_session_exercises")
      .insert(
        missing.map((e) => ({
          session_id: sessionId,
          client_id: clientId,
          coach_id: coachId,
          assigned_workout_exercise_id: e.id,
        })),
      )
      .select("id, assigned_workout_exercise_id, completed, is_pr, notes");
    for (const row of (inserted ?? []) as SessionExerciseRow[]) {
      exerciseRows[row.assigned_workout_exercise_id] = row;
    }
  }

  const sessionExerciseIds = exercises.map((e) => exerciseRows[e.id]?.id).filter((id): id is string => !!id);

  const { data: existingSets } = sessionExerciseIds.length
    ? await supabase
        .from("workout_session_sets")
        .select("id, session_exercise_id, set_number, reps, duration_seconds, weight, rest_seconds")
        .in("session_exercise_id", sessionExerciseIds)
        .order("set_number")
    : { data: [] };

  const setsByExercise: Record<string, SessionSetRow[]> = {};
  for (const row of existingSets ?? []) {
    const key = row.session_exercise_id as string;
    (setsByExercise[key] ??= []).push(row);
  }

  const setsToInsert: {
    session_exercise_id: string;
    client_id: string;
    coach_id: string;
    set_number: number;
    reps: string | null;
    duration_seconds: number | null;
    weight: string | null;
    rest_seconds: number | null;
  }[] = [];

  for (const exercise of exercises) {
    const sessionExerciseId = exerciseRows[exercise.id]?.id;
    if (!sessionExerciseId) continue;
    if (setsByExercise[sessionExerciseId]?.length) continue; // already seeded

    const count = Math.max(1, exercise.sets ?? 1);
    for (let i = 0; i < count; i++) {
      setsToInsert.push({
        session_exercise_id: sessionExerciseId,
        client_id: clientId,
        coach_id: coachId,
        set_number: i + 1,
        reps: exercise.prescription_type === "reps" ? exercise.reps : null,
        duration_seconds: exercise.prescription_type === "time" ? exercise.duration_seconds : null,
        weight: exercise.weight_note,
        rest_seconds: exercise.rest_seconds,
      });
    }
  }

  if (setsToInsert.length > 0) {
    const { data: insertedSets } = await supabase
      .from("workout_session_sets")
      .insert(setsToInsert)
      .select("id, session_exercise_id, set_number, reps, duration_seconds, weight, rest_seconds");
    for (const row of insertedSets ?? []) {
      const key = row.session_exercise_id as string;
      (setsByExercise[key] ??= []).push(row);
    }
  }

  return { exerciseRows, setsByExercise };
}
