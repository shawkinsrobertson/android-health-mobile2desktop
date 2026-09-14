"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { applyMediaField, readMediaField } from "@/lib/media";

const LIST_PATH = "/dashboard/library/workouts";

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
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

// ---------------------------------------------------------------------------
// Workout CRUD
// ---------------------------------------------------------------------------

export async function createWorkout(formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent("Name is required.")}`);
  }
  const description = strOrNull(formData.get("description"));

  const supabase = await createClient();

  let newId: string;
  try {
    const photo = await applyMediaField(
      supabase,
      coach.id,
      "workouts",
      readMediaField(formData, "photo"),
      null,
    );
    const video = await applyMediaField(
      supabase,
      coach.id,
      "workouts",
      readMediaField(formData, "video"),
      null,
    );

    const { data, error } = await supabase
      .from("library_workouts")
      .insert({
        coach_id: coach.id,
        name,
        description,
        photo_path: photo.path,
        photo_url: photo.url,
        video_path: video.path,
        video_url: video.url,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create workout");
    newId = data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create workout";
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${newId}`);
}

export async function updateWorkout(workoutId: string, formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`${LIST_PATH}/${workoutId}?error=${encodeURIComponent("Name is required.")}`);
  }
  const description = strOrNull(formData.get("description"));

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("library_workouts")
    .select("photo_path, video_path")
    .eq("id", workoutId)
    .eq("coach_id", coach.id)
    .single();

  try {
    const photo = await applyMediaField(
      supabase,
      coach.id,
      "workouts",
      readMediaField(formData, "photo"),
      existing?.photo_path,
    );
    const video = await applyMediaField(
      supabase,
      coach.id,
      "workouts",
      readMediaField(formData, "video"),
      existing?.video_path,
    );

    const { error } = await supabase
      .from("library_workouts")
      .update({
        name,
        description,
        photo_path: photo.path,
        photo_url: photo.url,
        video_path: video.path,
        video_url: video.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workoutId)
      .eq("coach_id", coach.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save workout";
    redirect(`${LIST_PATH}/${workoutId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

export async function deleteWorkout(workoutId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { error } = await supabase
    .from("library_workouts")
    .delete()
    .eq("id", workoutId)
    .eq("coach_id", coach.id);

  if (error) {
    // FK violation (23503): still referenced by a library_program_workouts
    // row (on delete restrict, see 0004_libraries.sql).
    const message =
      error.code === "23503"
        ? "This workout is still used in one or more programs. Remove it from those programs first."
        : error.message;
    redirect(`${LIST_PATH}/${workoutId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

// ---------------------------------------------------------------------------
// Workout <-> exercise join rows (the exercises a workout prescribes)
// ---------------------------------------------------------------------------

export async function addWorkoutExercise(workoutId: string, formData: FormData) {
  const coach = await requireCoach();
  const exerciseId = String(formData.get("exercise_id") ?? "");
  if (!exerciseId) {
    redirect(`${LIST_PATH}/${workoutId}?error=${encodeURIComponent("Pick an exercise to add.")}`);
  }

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("library_workout_exercises")
    .select("order_index")
    .eq("workout_id", workoutId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  const { error } = await supabase.from("library_workout_exercises").insert({
    coach_id: coach.id,
    workout_id: workoutId,
    exercise_id: exerciseId,
    order_index: nextOrder,
    sets: intOrNull(formData.get("sets")),
    reps: strOrNull(formData.get("reps")),
    weight_note: strOrNull(formData.get("weight_note")),
    rest_seconds: intOrNull(formData.get("rest_seconds")),
    tempo: strOrNull(formData.get("tempo")),
    notes: strOrNull(formData.get("notes")),
  });

  if (error) {
    redirect(`${LIST_PATH}/${workoutId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

export async function updateWorkoutExercise(workoutId: string, itemId: string, formData: FormData) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("library_workout_exercises")
    .update({
      sets: intOrNull(formData.get("sets")),
      reps: strOrNull(formData.get("reps")),
      weight_note: strOrNull(formData.get("weight_note")),
      rest_seconds: intOrNull(formData.get("rest_seconds")),
      tempo: strOrNull(formData.get("tempo")),
      notes: strOrNull(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

// Called directly from the client editor (not a <form> submission), so it
// stays quiet on failure rather than redirecting the coach away mid-edit --
// the row simply stays put and the next real page load reflects the truth.
export async function removeWorkoutExercise(workoutId: string, itemId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("library_workout_exercises")
    .delete()
    .eq("id", itemId)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

// orderedIds is the full new order (see components/library/WorkoutExerciseListEditor.tsx).
export async function reorderWorkoutExercises(workoutId: string, orderedIds: string[]) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("library_workout_exercises")
        .update({ order_index: index })
        .eq("id", id)
        .eq("workout_id", workoutId)
        .eq("coach_id", coach.id),
    ),
  );

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}
