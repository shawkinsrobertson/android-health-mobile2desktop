"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { applyMediaField, readMediaField } from "@/lib/media";

const LIST_PATH = "/dashboard/library/programs";

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
// Program CRUD
// ---------------------------------------------------------------------------

export async function createProgram(formData: FormData) {
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
      "programs",
      readMediaField(formData, "photo"),
      null,
    );
    const video = await applyMediaField(
      supabase,
      coach.id,
      "programs",
      readMediaField(formData, "video"),
      null,
    );

    const { data, error } = await supabase
      .from("library_programs")
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

    if (error || !data) throw new Error(error?.message ?? "Failed to create program");
    newId = data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create program";
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${newId}`);
}

export async function updateProgram(programId: string, formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`${LIST_PATH}/${programId}?error=${encodeURIComponent("Name is required.")}`);
  }
  const description = strOrNull(formData.get("description"));

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("library_programs")
    .select("photo_path, video_path")
    .eq("id", programId)
    .eq("coach_id", coach.id)
    .single();

  try {
    const photo = await applyMediaField(
      supabase,
      coach.id,
      "programs",
      readMediaField(formData, "photo"),
      existing?.photo_path,
    );
    const video = await applyMediaField(
      supabase,
      coach.id,
      "programs",
      readMediaField(formData, "video"),
      existing?.video_path,
    );

    const { error } = await supabase
      .from("library_programs")
      .update({
        name,
        description,
        photo_path: photo.path,
        photo_url: photo.url,
        video_path: video.path,
        video_url: video.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", programId)
      .eq("coach_id", coach.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save program";
    redirect(`${LIST_PATH}/${programId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${programId}`);
}

export async function deleteProgram(programId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { error } = await supabase
    .from("library_programs")
    .delete()
    .eq("id", programId)
    .eq("coach_id", coach.id);

  if (error) {
    redirect(`${LIST_PATH}/${programId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

// ---------------------------------------------------------------------------
// Program <-> workout join rows (the workouts a program includes)
// ---------------------------------------------------------------------------

export async function addProgramWorkout(programId: string, formData: FormData) {
  const coach = await requireCoach();
  const workoutId = String(formData.get("workout_id") ?? "");
  if (!workoutId) {
    redirect(`${LIST_PATH}/${programId}?error=${encodeURIComponent("Pick a workout to add.")}`);
  }

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("library_program_workouts")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  const { error } = await supabase.from("library_program_workouts").insert({
    coach_id: coach.id,
    program_id: programId,
    workout_id: workoutId,
    order_index: nextOrder,
    week_number: intOrNull(formData.get("week_number")),
    day_of_week: intOrNull(formData.get("day_of_week")),
    notes: strOrNull(formData.get("notes")),
  });

  if (error) {
    redirect(`${LIST_PATH}/${programId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`${LIST_PATH}/${programId}`);
}

export async function updateProgramWorkout(programId: string, itemId: string, formData: FormData) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("library_program_workouts")
    .update({
      week_number: intOrNull(formData.get("week_number")),
      day_of_week: intOrNull(formData.get("day_of_week")),
      notes: strOrNull(formData.get("notes")),
    })
    .eq("id", itemId)
    .eq("program_id", programId)
    .eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${programId}`);
}

// Called directly from the client editor (not a <form> submission) -- see
// the matching comment on removeWorkoutExercise in ../workouts/actions.ts.
export async function removeProgramWorkout(programId: string, itemId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("library_program_workouts")
    .delete()
    .eq("id", itemId)
    .eq("program_id", programId)
    .eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${programId}`);
}

export async function reorderProgramWorkouts(programId: string, orderedIds: string[]) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("library_program_workouts")
        .update({ order_index: index })
        .eq("id", id)
        .eq("program_id", programId)
        .eq("coach_id", coach.id),
    ),
  );

  revalidatePath(`${LIST_PATH}/${programId}`);
}
