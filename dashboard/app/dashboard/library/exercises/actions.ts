"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { applyMediaField, readMediaField } from "@/lib/media";

const LIST_PATH = "/dashboard/library/exercises";

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
  return profile;
}

export async function createExercise(formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent("Name is required.")}`);
  }

  const category = String(formData.get("category") ?? "").trim() || null;
  const instructions = String(formData.get("instructions") ?? "").trim() || null;

  const supabase = await createClient();

  let newId: string;
  try {
    const photo = await applyMediaField(
      supabase,
      coach.id,
      "exercises",
      readMediaField(formData, "photo"),
      null,
    );
    const video = await applyMediaField(
      supabase,
      coach.id,
      "exercises",
      readMediaField(formData, "video"),
      null,
    );

    const { data, error } = await supabase
      .from("library_exercises")
      .insert({
        coach_id: coach.id,
        name,
        category,
        instructions,
        photo_path: photo.path,
        photo_url: photo.url,
        video_path: video.path,
        video_url: video.url,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create exercise");
    newId = data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create exercise";
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${newId}`);
}

export async function updateExercise(exerciseId: string, formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`${LIST_PATH}/${exerciseId}?error=${encodeURIComponent("Name is required.")}`);
  }

  const category = String(formData.get("category") ?? "").trim() || null;
  const instructions = String(formData.get("instructions") ?? "").trim() || null;

  const supabase = await createClient();

  // No coach_id filter on this read -- RLS lets a coach select a shared
  // (coach_id IS NULL) row too, so we can tell "not found" apart from
  // "found, but it's shared and not yours to edit" and give a clear error
  // instead of the update below silently matching zero rows.
  const { data: existing } = await supabase
    .from("library_exercises")
    .select("coach_id, photo_path, video_path")
    .eq("id", exerciseId)
    .single();

  if (!existing) redirect(LIST_PATH);
  if (existing.coach_id !== coach.id) {
    redirect(
      `${LIST_PATH}/${exerciseId}?error=${encodeURIComponent("This is a shared exercise and can't be edited here.")}`,
    );
  }

  try {
    const photo = await applyMediaField(
      supabase,
      coach.id,
      "exercises",
      readMediaField(formData, "photo"),
      existing?.photo_path,
    );
    const video = await applyMediaField(
      supabase,
      coach.id,
      "exercises",
      readMediaField(formData, "video"),
      existing?.video_path,
    );

    const { error } = await supabase
      .from("library_exercises")
      .update({
        name,
        category,
        instructions,
        photo_path: photo.path,
        photo_url: photo.url,
        video_path: video.path,
        video_url: video.url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", exerciseId)
      .eq("coach_id", coach.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save exercise";
    redirect(`${LIST_PATH}/${exerciseId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${exerciseId}`);
}

export async function deleteExercise(exerciseId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("library_exercises")
    .select("coach_id")
    .eq("id", exerciseId)
    .single();

  if (!existing) redirect(LIST_PATH);
  if (existing.coach_id !== coach.id) {
    redirect(
      `${LIST_PATH}/${exerciseId}?error=${encodeURIComponent("This is a shared exercise and can't be deleted here.")}`,
    );
  }

  const { error } = await supabase
    .from("library_exercises")
    .delete()
    .eq("id", exerciseId)
    .eq("coach_id", coach.id);

  if (error) {
    // Postgres FK violation (23503): exercise is still referenced by a
    // library_workout_exercises row (on delete restrict, see 0004_libraries.sql).
    const message =
      error.code === "23503"
        ? "This exercise is still used in one or more workouts. Remove it from those workouts first."
        : error.message;
    redirect(`${LIST_PATH}/${exerciseId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
