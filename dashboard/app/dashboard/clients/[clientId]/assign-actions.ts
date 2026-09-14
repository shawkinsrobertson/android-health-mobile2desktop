"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
  return profile;
}

// Each of these is a thin wrapper around the matching Postgres RPC in
// supabase/migrations/0005_assigned.sql, which does the actual recursive
// snapshot copy (workout -> its exercises; program -> its workouts -> their
// exercises) as one atomic function call. See that migration's header
// comment for why the copy lives in the DB rather than here.

export async function assignWorkoutToClient(clientId: string, formData: FormData) {
  await requireCoach();
  const workoutId = String(formData.get("workout_id") ?? "");
  const path = `/dashboard/clients/${clientId}`;
  if (!workoutId) redirect(`${path}?error=${encodeURIComponent("Pick a workout to assign.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_workout_to_client", {
    p_workout_id: workoutId,
    p_client_id: clientId,
  });

  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(path);
}

export async function assignProgramToClient(clientId: string, formData: FormData) {
  await requireCoach();
  const programId = String(formData.get("program_id") ?? "");
  const path = `/dashboard/clients/${clientId}`;
  if (!programId) redirect(`${path}?error=${encodeURIComponent("Pick a program to assign.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_program_to_client", {
    p_program_id: programId,
    p_client_id: clientId,
  });

  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(path);
}

export async function assignDocumentToClient(clientId: string, formData: FormData) {
  await requireCoach();
  const documentId = String(formData.get("document_id") ?? "");
  const path = `/dashboard/clients/${clientId}`;
  if (!documentId) redirect(`${path}?error=${encodeURIComponent("Pick a document to assign.")}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_document_to_client", {
    p_document_id: documentId,
    p_client_id: clientId,
  });

  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(path);
}
