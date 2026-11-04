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

// Mirror image of clients/[clientId]/assign-actions.ts's
// assign*ToClient functions -- those bind the client and read the item
// from FormData (assign-from-the-client-page direction); these bind the
// item and read the client from FormData (assign-from-the-library-item
// direction, for Libraries' new per-item "+ Assign" control). Same
// underlying RPCs, just which side is fixed vs. picked is flipped.

export async function assignLibraryWorkoutToClient(workoutId: string, formData: FormData) {
  await requireCoach();
  const clientId = String(formData.get("client_id") ?? "");
  const itemPath = `/dashboard/library/workouts/${workoutId}`;
  if (!clientId) redirect(`${itemPath}?error=${encodeURIComponent("Pick a client to assign to.")}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_workout_to_client", {
    p_workout_id: workoutId,
    p_client_id: clientId,
  });

  if (error) redirect(`${itemPath}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/dashboard/clients/${clientId}`);
  redirect(`/dashboard/clients/${clientId}/assigned/workouts/${data}`);
}

export async function assignLibraryProgramToClient(programId: string, formData: FormData) {
  await requireCoach();
  const clientId = String(formData.get("client_id") ?? "");
  const itemPath = `/dashboard/library/programs/${programId}`;
  if (!clientId) redirect(`${itemPath}?error=${encodeURIComponent("Pick a client to assign to.")}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_program_to_client", {
    p_program_id: programId,
    p_client_id: clientId,
  });

  if (error) redirect(`${itemPath}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/dashboard/clients/${clientId}`);
  redirect(`/dashboard/clients/${clientId}/assigned/programs/${data}`);
}

export async function assignLibraryDocumentToClient(documentId: string, formData: FormData) {
  await requireCoach();
  const clientId = String(formData.get("client_id") ?? "");
  const itemPath = `/dashboard/library/documents/${documentId}`;
  if (!clientId) redirect(`${itemPath}?error=${encodeURIComponent("Pick a client to assign to.")}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_document_to_client", {
    p_document_id: documentId,
    p_client_id: clientId,
  });

  if (error) redirect(`${itemPath}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/dashboard/clients/${clientId}`);
  redirect(`/dashboard/clients/${clientId}/assigned/documents/${data}`);
}

// Unlike the three above, a check-in needs a recurrence pattern (which
// weekday(s), starting when), not just a client -- see
// AssignCheckInToClientCard, and assign_check_in_to_client
// (0045_check_ins_assignments.sql) for how the actual first occurrence
// date gets computed from that pattern.
export async function assignLibraryCheckInToClient(checkInId: string, formData: FormData) {
  await requireCoach();
  const clientId = String(formData.get("client_id") ?? "");
  const itemPath = `/dashboard/library/check-ins/${checkInId}`;
  if (!clientId) redirect(`${itemPath}?error=${encodeURIComponent("Pick a client to assign to.")}`);

  let recurrenceDaysOfWeek: number[];
  try {
    recurrenceDaysOfWeek = JSON.parse(String(formData.get("recurrence_days_of_week") ?? "[]"));
  } catch {
    recurrenceDaysOfWeek = [];
  }
  if (!Array.isArray(recurrenceDaysOfWeek) || recurrenceDaysOfWeek.length === 0) {
    redirect(`${itemPath}?error=${encodeURIComponent("Pick at least one day of the week.")}`);
  }
  const startDate = String(formData.get("start_date") ?? "").trim() || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_check_in_to_client", {
    p_check_in_id: checkInId,
    p_client_id: clientId,
    p_recurrence_days_of_week: recurrenceDaysOfWeek,
    p_start_date: startDate,
  });

  if (error) redirect(`${itemPath}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/dashboard/clients/${clientId}`);
  redirect(`/dashboard/clients/${clientId}/assigned/check-ins/${data}`);
}
