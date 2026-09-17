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
// The session starts un-started (started_at null); the timer only begins
// once the client taps "Start Workout" on the session page.
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

// ---------------------------------------------------------------------------
// Workout-level clock -- these are explicit button presses (Start/Pause/
// Resume/Stop), not autosave, so it's fine (and useful) to revalidate and
// hand back the authoritative new timer fields; see
// supabase/migrations/0010_session_sets_and_timers.sql for how elapsed
// time is derived from started_at/paused_at/total_paused_seconds.
// ---------------------------------------------------------------------------

export async function startWorkoutTimer(sessionId: string) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data } = await supabase
    .from("workout_sessions")
    .update({ started_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("client_id", profile.id)
    .is("started_at", null)
    .select("started_at, paused_at, total_paused_seconds")
    .single();

  revalidatePath(`/client/assigned`);
  return data;
}

export async function pauseWorkoutTimer(sessionId: string) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data } = await supabase
    .from("workout_sessions")
    .update({ paused_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("client_id", profile.id)
    .select("started_at, paused_at, total_paused_seconds")
    .single();

  return data;
}

export async function resumeWorkoutTimer(sessionId: string) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("workout_sessions")
    .select("started_at, paused_at, total_paused_seconds")
    .eq("id", sessionId)
    .eq("client_id", profile.id)
    .single();

  if (!session?.paused_at) return session;

  const pausedSeconds = Math.round((Date.now() - new Date(session.paused_at).getTime()) / 1000);

  const { data } = await supabase
    .from("workout_sessions")
    .update({
      paused_at: null,
      total_paused_seconds: (session.total_paused_seconds ?? 0) + Math.max(0, pausedSeconds),
    })
    .eq("id", sessionId)
    .eq("client_id", profile.id)
    .select("started_at, paused_at, total_paused_seconds")
    .single();

  return data;
}

// Called both to actually finish a session (from the confirm-then-submit
// flow in FinishWorkoutForm) and to edit notes afterward (a plain <form> on
// the summary page) -- either way, completing lands back on the summary
// page rather than the live tracking page, per the "finish -> summary"
// flow. Set completion time only once: re-submitting notes from the
// summary page shouldn't push completed_at forward.
export async function completeSession(assignedWorkoutId: string, sessionId: string, formData: FormData) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("workout_sessions")
    .select("completed_at")
    .eq("id", sessionId)
    .eq("client_id", profile.id)
    .single();

  await supabase
    .from("workout_sessions")
    .update({
      notes: strOrNull(formData.get("notes")),
      completed_at: existing?.completed_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("client_id", profile.id);

  revalidatePath(`/client/assigned/workouts/${assignedWorkoutId}/sessions/${sessionId}`);
  revalidatePath(`/client/assigned/workouts/${assignedWorkoutId}`);
  revalidatePath("/client");
  redirect(`/client/assigned/workouts/${assignedWorkoutId}/sessions/${sessionId}/summary`);
}

// ---------------------------------------------------------------------------
// Per-exercise (completed/PR/notes) and per-set (reps-or-duration/weight/
// rest) logging. Called directly from client components on blur/change,
// not as <form> submissions, and deliberately skip revalidatePath -- the
// calling components hold their own optimistic state (see
// components/library/SessionLogger.tsx), and a full Server Component
// refresh on every keystroke-blur would risk clobbering an unrelated
// field's in-progress edit elsewhere on the same page. The database is
// still the source of truth; the next real navigation reflects it.
// ---------------------------------------------------------------------------

export async function updateSessionExercise(sessionId: string, assignedWorkoutExerciseId: string, formData: FormData) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("workout_sessions")
    .select("id, coach_id")
    .eq("id", sessionId)
    .eq("client_id", profile.id)
    .single();

  if (!session) return;

  await supabase.from("workout_session_exercises").upsert(
    {
      session_id: sessionId,
      client_id: profile.id,
      coach_id: session.coach_id,
      assigned_workout_exercise_id: assignedWorkoutExerciseId,
      completed: formData.get("completed") === "on",
      is_pr: formData.get("is_pr") === "on",
      notes: strOrNull(formData.get("notes")),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id,assigned_workout_exercise_id" },
  );
}

export async function addSessionSet(sessionExerciseId: string) {
  const profile = await requireClient();
  const supabase = await createClient();

  const { data: sessionExercise } = await supabase
    .from("workout_session_exercises")
    .select("id, session_id, coach_id")
    .eq("id", sessionExerciseId)
    .eq("client_id", profile.id)
    .single();

  if (!sessionExercise) return null;

  const { data: lastSet } = await supabase
    .from("workout_session_sets")
    .select("set_number, reps, duration_seconds, weight, rest_seconds")
    .eq("session_exercise_id", sessionExerciseId)
    .order("set_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: newSet } = await supabase
    .from("workout_session_sets")
    .insert({
      session_exercise_id: sessionExerciseId,
      client_id: profile.id,
      coach_id: sessionExercise.coach_id,
      set_number: (lastSet?.set_number ?? 0) + 1,
      // Carry the previous set's values forward as a convenience default
      // -- most sets in a row use the same weight/rest.
      reps: lastSet?.reps ?? null,
      duration_seconds: lastSet?.duration_seconds ?? null,
      weight: lastSet?.weight ?? null,
      rest_seconds: lastSet?.rest_seconds ?? null,
    })
    .select("id, set_number, reps, duration_seconds, weight, rest_seconds")
    .single();

  return newSet ?? null;
}

export async function updateSessionSet(setId: string, formData: FormData) {
  const profile = await requireClient();
  const supabase = await createClient();

  await supabase
    .from("workout_session_sets")
    .update({
      reps: strOrNull(formData.get("reps")),
      duration_seconds: intOrNull(formData.get("duration_seconds")),
      weight: strOrNull(formData.get("weight")),
      rest_seconds: intOrNull(formData.get("rest_seconds")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", setId)
    .eq("client_id", profile.id);
}

export async function deleteSessionSet(sessionExerciseId: string, setId: string) {
  const profile = await requireClient();
  const supabase = await createClient();

  await supabase.from("workout_session_sets").delete().eq("id", setId).eq("client_id", profile.id);

  // Renumber the remaining sets so set_number stays a clean 1..N sequence.
  const { data: remaining } = await supabase
    .from("workout_session_sets")
    .select("id")
    .eq("session_exercise_id", sessionExerciseId)
    .eq("client_id", profile.id)
    .order("set_number");

  await Promise.all(
    (remaining ?? []).map((row, index) =>
      supabase
        .from("workout_session_sets")
        .update({ set_number: index + 1 })
        .eq("id", row.id)
        .eq("client_id", profile.id),
    ),
  );
}
