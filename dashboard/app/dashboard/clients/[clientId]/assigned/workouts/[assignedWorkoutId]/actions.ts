"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

// Mirrors app/dashboard/library/workouts/actions.ts's exercise/block
// mutations exactly, but targets a specific client's assigned copy of a
// workout (assignment_components/assignment_component_groups) instead of
// a template (template_components/template_component_groups). New here --
// no editor for an assignment's own content existed before this; every
// assigned-workout view was read-only. RLS already allows this
// (assignment_components_coach_all / assignment_component_groups_coach_all,
// supabase/migrations/0034_assignments.sql), so nothing schema-side is
// new, only this application code.
//
// Every function here takes clientId first -- bound in at the page's call
// site (`addAssignedExercise.bind(null, clientId)`, same shape every
// `updateX.bind(null, id)` call elsewhere in this app already uses) so the
// resulting function matches WorkoutExerciseListEditor's generic
// WorkoutExerciseActions shape (targetId, ...) without the component
// itself needing to know a client is involved at all.

function path(clientId: string, assignedWorkoutId: string) {
  return `/dashboard/clients/${clientId}/assigned/workouts/${assignedWorkoutId}`;
}

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

export async function addAssignedExercise(clientId: string, assignedWorkoutId: string, formData: FormData) {
  const coach = await requireCoach();
  const exerciseId = String(formData.get("exercise_id") ?? "");
  if (!exerciseId) {
    redirect(`${path(clientId, assignedWorkoutId)}?error=${encodeURIComponent("Pick an exercise to add.")}`);
  }

  const supabase = await createClient();

  // assignment_components is a flattened copy, not a join (see
  // 0034_assignments.sql's own header comment) -- the exercise's current
  // display fields get copied onto the new row once, same as
  // _assign_workout_snapshot does when a workout is first assigned.
  const { data: exercise } = await supabase
    .from("templates")
    .select("name, instructions, photo_path, photo_url, video_path, video_url")
    .eq("id", exerciseId)
    .eq("type", "exercise")
    .single();

  if (!exercise) {
    redirect(`${path(clientId, assignedWorkoutId)}?error=${encodeURIComponent("That exercise couldn't be found.")}`);
  }

  const { data: maxRow } = await supabase
    .from("assignment_components")
    .select("order_index")
    .eq("assignment_id", assignedWorkoutId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  const prescriptionType = formData.get("prescription_type") === "time" ? "time" : "reps";

  const { error } = await supabase.from("assignment_components").insert({
    client_id: clientId,
    coach_id: coach.id,
    assignment_id: assignedWorkoutId,
    source_template_id: exerciseId,
    order_index: nextOrder,
    name: exercise.name,
    instructions: exercise.instructions,
    photo_path: exercise.photo_path,
    photo_url: exercise.photo_url,
    video_path: exercise.video_path,
    video_url: exercise.video_url,
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
    redirect(`${path(clientId, assignedWorkoutId)}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(path(clientId, assignedWorkoutId));
}

export async function updateAssignedExercise(
  clientId: string,
  assignedWorkoutId: string,
  itemId: string,
  formData: FormData,
) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const prescriptionType = formData.get("prescription_type") === "time" ? "time" : "reps";

  await supabase
    .from("assignment_components")
    .update({
      sets: intOrNull(formData.get("sets")),
      reps: prescriptionType === "reps" ? strOrNull(formData.get("reps")) : null,
      prescription_type: prescriptionType,
      duration_seconds: prescriptionType === "time" ? intOrNull(formData.get("duration_seconds")) : null,
      weight_note: strOrNull(formData.get("weight_note")),
      rest_seconds: intOrNull(formData.get("rest_seconds")),
      tempo: strOrNull(formData.get("tempo")),
      notes: strOrNull(formData.get("notes")),
    })
    .eq("id", itemId)
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .eq("coach_id", coach.id);

  revalidatePath(path(clientId, assignedWorkoutId));
}

export async function removeAssignedExercise(clientId: string, assignedWorkoutId: string, itemId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { data: removed } = await supabase
    .from("assignment_components")
    .select("group_id")
    .eq("id", itemId)
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .eq("coach_id", coach.id)
    .single();

  await supabase
    .from("assignment_components")
    .delete()
    .eq("id", itemId)
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .eq("coach_id", coach.id);

  if (removed?.group_id) {
    const { count } = await supabase
      .from("assignment_components")
      .select("id", { count: "exact", head: true })
      .eq("group_id", removed.group_id);
    if (!count || count <= 1) {
      await supabase.from("assignment_components").update({ group_id: null }).eq("group_id", removed.group_id);
      await supabase
        .from("assignment_component_groups")
        .delete()
        .eq("id", removed.group_id)
        .eq("coach_id", coach.id);
    }
  }

  revalidatePath(path(clientId, assignedWorkoutId));
}

export async function reorderAssignedExercises(clientId: string, assignedWorkoutId: string, orderedIds: string[]) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("assignment_components")
        .update({ order_index: index })
        .eq("id", id)
        .eq("assignment_id", assignedWorkoutId)
        .eq("client_id", clientId)
        .eq("coach_id", coach.id),
    ),
  );

  revalidatePath(path(clientId, assignedWorkoutId));
}

export async function createAssignedBlock(
  clientId: string,
  assignedWorkoutId: string,
  blockType: "superset" | "circuit",
  rounds: number,
  exerciseIds: string[],
) {
  const coach = await requireCoach();
  if (exerciseIds.length < 2) return;

  const supabase = await createClient();

  const { data: block, error } = await supabase
    .from("assignment_component_groups")
    .insert({
      client_id: clientId,
      coach_id: coach.id,
      assignment_id: assignedWorkoutId,
      block_type: blockType,
      rounds: Math.max(1, rounds || 1),
    })
    .select("id")
    .single();

  if (error || !block) return;

  await supabase
    .from("assignment_components")
    .update({ group_id: block.id })
    .in("id", exerciseIds)
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .eq("coach_id", coach.id);

  revalidatePath(path(clientId, assignedWorkoutId));
}

export async function updateAssignedBlock(
  clientId: string,
  assignedWorkoutId: string,
  blockId: string,
  formData: FormData,
) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const blockType = formData.get("block_type") === "circuit" ? "circuit" : "superset";
  const rounds = Math.max(1, intOrNull(formData.get("rounds")) ?? 1);

  await supabase
    .from("assignment_component_groups")
    .update({
      block_type: blockType,
      rounds,
      notes: strOrNull(formData.get("notes")),
    })
    .eq("id", blockId)
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .eq("coach_id", coach.id);

  revalidatePath(path(clientId, assignedWorkoutId));
}

export async function ungroupAssignedBlock(clientId: string, assignedWorkoutId: string, blockId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("assignment_components")
    .update({ group_id: null })
    .eq("group_id", blockId)
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .eq("coach_id", coach.id);

  await supabase.from("assignment_component_groups").delete().eq("id", blockId).eq("coach_id", coach.id);

  revalidatePath(path(clientId, assignedWorkoutId));
}

export async function deleteAssignedBlock(clientId: string, assignedWorkoutId: string, blockId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase
    .from("assignment_component_groups")
    .delete()
    .eq("id", blockId)
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .eq("coach_id", coach.id);

  revalidatePath(path(clientId, assignedWorkoutId));
}

// Same full-renumber approach as moveWorkoutUnit -- see that function's
// own comment in workouts/actions.ts for why.
export async function moveAssignedUnit(
  clientId: string,
  assignedWorkoutId: string,
  unitKey: string,
  direction: -1 | 1,
) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("assignment_components")
    .select("id, group_id, order_index")
    .eq("assignment_id", assignedWorkoutId)
    .eq("client_id", clientId)
    .order("order_index");

  if (!rows || rows.length === 0) return;

  const groups = new Map<string, { key: string; memberIds: string[]; minOrder: number }>();
  for (const row of rows) {
    const key = row.group_id ? `block:${row.group_id}` : `exercise:${row.id}`;
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
        .from("assignment_components")
        .update({ order_index: index })
        .eq("id", id)
        .eq("assignment_id", assignedWorkoutId)
        .eq("client_id", clientId)
        .eq("coach_id", coach.id),
    ),
  );

  revalidatePath(path(clientId, assignedWorkoutId));
}
