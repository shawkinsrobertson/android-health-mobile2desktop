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

  const prescriptionType = formData.get("prescription_type") === "time" ? "time" : "reps";

  const { error } = await supabase.from("library_workout_exercises").insert({
    coach_id: coach.id,
    workout_id: workoutId,
    exercise_id: exerciseId,
    order_index: nextOrder,
    sets: intOrNull(formData.get("sets")),
    reps: prescriptionType === "reps" ? strOrNull(formData.get("reps")) : null,
    prescription_type: prescriptionType,
    duration_seconds: prescriptionType === "time" ? intOrNull(formData.get("duration_seconds")) : null,
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

  const prescriptionType = formData.get("prescription_type") === "time" ? "time" : "reps";

  await supabase
    .from("library_workout_exercises")
    .update({
      sets: intOrNull(formData.get("sets")),
      reps: prescriptionType === "reps" ? strOrNull(formData.get("reps")) : null,
      prescription_type: prescriptionType,
      duration_seconds: prescriptionType === "time" ? intOrNull(formData.get("duration_seconds")) : null,
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

  const { data: removed } = await supabase
    .from("library_workout_exercises")
    .select("block_id")
    .eq("id", itemId)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id)
    .single();

  await supabase
    .from("library_workout_exercises")
    .delete()
    .eq("id", itemId)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id);

  // A block with 0 or 1 members left over isn't a group anymore -- clean
  // it up rather than leaving a superset/circuit box around one exercise.
  if (removed?.block_id) {
    const { count } = await supabase
      .from("library_workout_exercises")
      .select("id", { count: "exact", head: true })
      .eq("block_id", removed.block_id);
    if (!count || count <= 1) {
      await supabase.from("library_workout_exercises").update({ block_id: null }).eq("block_id", removed.block_id);
      await supabase
        .from("library_workout_blocks")
        .delete()
        .eq("id", removed.block_id)
        .eq("coach_id", coach.id);
    }
  }

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

// orderedIds is the full new order of one flat list of exercise rows --
// either every standalone/top-level exercise+block member together (not
// used that way -- see moveWorkoutUnit below for that), or just the
// members of a single block, which is the actual use here (reordering
// exercises within a superset/circuit).
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

// ---------------------------------------------------------------------------
// Workout blocks (supersets/circuits) -- grouping 2+ of a workout's
// exercise rows to be performed together. See
// supabase/migrations/0008_workout_blocks.sql for the data model: a block
// is purely additive (library_workout_exercises.block_id is nullable),
// and "rounds" lives on the block rather than per-exercise "sets" since a
// synced group's members all repeat together.
// ---------------------------------------------------------------------------

// Called directly from the client editor with the ids the coach checked,
// not a <form> submission -- selection state lives client-side.
export async function createWorkoutBlock(
  workoutId: string,
  blockType: "superset" | "circuit",
  rounds: number,
  exerciseIds: string[],
) {
  const coach = await requireCoach();
  if (exerciseIds.length < 2) return;

  const supabase = await createClient();

  const { data: block, error } = await supabase
    .from("library_workout_blocks")
    .insert({
      coach_id: coach.id,
      workout_id: workoutId,
      block_type: blockType,
      rounds: Math.max(1, rounds || 1),
    })
    .select("id")
    .single();

  if (error || !block) return;

  await supabase
    .from("library_workout_exercises")
    .update({ block_id: block.id })
    .in("id", exerciseIds)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

export async function updateWorkoutBlock(workoutId: string, blockId: string, formData: FormData) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const blockType = formData.get("block_type") === "circuit" ? "circuit" : "superset";
  const rounds = Math.max(1, intOrNull(formData.get("rounds")) ?? 1);

  await supabase
    .from("library_workout_blocks")
    .update({
      block_type: blockType,
      rounds,
      notes: strOrNull(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", blockId)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

// Un-groups the block's members back to standalone exercises (keeps the
// exercises, just drops the grouping) and removes the now-empty block.
export async function ungroupWorkoutBlock(workoutId: string, blockId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("library_workout_exercises")
    .update({ block_id: null })
    .eq("block_id", blockId)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id);

  await supabase.from("library_workout_blocks").delete().eq("id", blockId).eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

// Deletes the block AND its member exercises entirely (on delete cascade
// on library_workout_exercises.block_id) -- use ungroupWorkoutBlock
// instead to keep the exercises as standalone rows.
export async function deleteWorkoutBlock(workoutId: string, blockId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("library_workout_blocks")
    .delete()
    .eq("id", blockId)
    .eq("workout_id", workoutId)
    .eq("coach_id", coach.id);

  revalidatePath(`${LIST_PATH}/${workoutId}`);
}

// Moves a top-level unit -- a standalone exercise, or an entire block --
// up or down relative to the workout's other top-level units. Computes
// the current top-level order itself by grouping library_workout_exercises
// rows by block_id (rather than requiring the caller to reconstruct and
// send the whole reordered, block-expanded list), then renumbers every
// row's order_index from scratch in the new order -- the same
// full-renumber approach reorderWorkoutExercises above already uses, just
// with blocks collapsed to one movable unit first.
export async function moveWorkoutUnit(workoutId: string, unitKey: string, direction: -1 | 1) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("library_workout_exercises")
    .select("id, block_id, order_index")
    .eq("workout_id", workoutId)
    .order("order_index");

  if (!rows || rows.length === 0) return;

  const groups = new Map<string, { key: string; memberIds: string[]; minOrder: number }>();
  for (const row of rows) {
    const key = row.block_id ? `block:${row.block_id}` : `exercise:${row.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.memberIds.push(row.id);
      existing.minOrder = Math.min(existing.minOrder, row.order_index);
    } else {
      groups.set(key, { key, memberIds: [row.id], minOrder: row.order_index });
    }
  }
  const units = [...groups.values()].sort((a, b) => a.minOrder - b.minOrder);

  const idx = units.findIndex((u) => u.key === unitKey);
  const swapIdx = idx + direction;
  if (idx < 0 || swapIdx < 0 || swapIdx >= units.length) return;

  const reordered = [...units];
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
  const flatIds = reordered.flatMap((u) => u.memberIds);

  await Promise.all(
    flatIds.map((id, index) =>
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
