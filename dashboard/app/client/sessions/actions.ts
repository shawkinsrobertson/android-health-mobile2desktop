"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

async function requireClient() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") redirect("/login");
  return profile;
}

function strOrNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// Creates a new session every time -- an assigned workout is followed
// repeatedly (e.g. every Monday for weeks), so "log this workout" always
// starts a fresh dated entry rather than reusing/overwriting a prior one.
export async function startWorkoutSession(assignedWorkoutId: string) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data: workout } = await supabase
    .from("assigned_workouts")
    .select("id, coach_id")
    .eq("id", assignedWorkoutId)
    .eq("client_id", profile.id)
    .single();

  if (!workout) redirect("/client/assigned");

  const { data: session, error } = await supabase
    .from("workout_sessions")
    .insert({
      client_id: profile.id,
      coach_id: workout.coach_id,
      assigned_workout_id: assignedWorkoutId,
    })
    .select("id")
    .single();

  if (error || !session) {
    redirect(
      `/client/assigned/workouts/${assignedWorkoutId}?error=${encodeURIComponent("Couldn't start a session -- try again.")}`,
    );
  }

  revalidatePath(`/client/assigned/workouts/${assignedWorkoutId}`);
  redirect(`/client/assigned/workouts/${assignedWorkoutId}/sessions/${session.id}`);
}

// Called per-exercise from SessionLogger's per-exercise forms -- one save
// button per exercise, not a single whole-session submit, so a client
// logging a long workout doesn't lose everything if they get interrupted
// partway through.
export async function logSessionExercise(
  assignedWorkoutId: string,
  sessionId: string,
  assignedWorkoutExerciseId: string,
  formData: FormData,
) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("workout_sessions")
    .select("id, coach_id")
    .eq("id", sessionId)
    .eq("client_id", profile.id)
    .single();

  if (!session) redirect(`/client/assigned/workouts/${assignedWorkoutId}`);

  const prescriptionType = formData.get("prescription_type") === "time" ? "time" : "reps";

  const { error } = await supabase.from("workout_session_exercises").upsert(
    {
      session_id: sessionId,
      client_id: profile.id,
      coach_id: session.coach_id,
      assigned_workout_exercise_id: assignedWorkoutExerciseId,
      completed: formData.get("completed") === "on",
      is_pr: formData.get("is_pr") === "on",
      actual_sets: intOrNull(formData.get("actual_sets")),
      actual_reps: prescriptionType === "reps" ? strOrNull(formData.get("actual_reps")) : null,
      actual_duration_seconds:
        prescriptionType === "time" ? intOrNull(formData.get("actual_duration_seconds")) : null,
      actual_weight: strOrNull(formData.get("actual_weight")),
      notes: strOrNull(formData.get("notes")),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id,assigned_workout_exercise_id" },
  );

  if (error) {
    redirect(
      `/client/assigned/workouts/${assignedWorkoutId}/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/client/assigned/workouts/${assignedWorkoutId}/sessions/${sessionId}`);
}

export async function completeSession(assignedWorkoutId: string, sessionId: string, formData: FormData) {
  const profile = await requireClient();
  const supabase = await createClient();

  await supabase
    .from("workout_sessions")
    .update({
      notes: strOrNull(formData.get("notes")),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("client_id", profile.id);

  revalidatePath(`/client/assigned/workouts/${assignedWorkoutId}/sessions/${sessionId}`);
  revalidatePath(`/client/assigned/workouts/${assignedWorkoutId}`);
}
