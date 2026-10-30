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
//
// Two call shapes share this same RPC logic: the plain client-page picker
// (AssignedCategory) wants the classic redirect-to-what-you-just-assigned
// behavior, but the calendar's own "+ Assign" entry point (AssignScheduleModal)
// is a modal the coach expects to just close with the new item showing up
// on the calendar underneath it, not a navigation away from the calendar
// entirely. The *Inline variants below do the same insert and return the
// new id instead of redirecting, so the modal can stay put and refetch.

async function doAssignWorkout(clientId: string, formData: FormData): Promise<string> {
  await requireCoach();
  const workoutId = String(formData.get("workout_id") ?? "");
  if (!workoutId) throw new Error("Pick a workout to assign.");

  // Present when assigned from the calendar's own "+ Assign" entry point;
  // absent from the plain client-page picker. Omitted (not sent as an
  // explicit null) when there isn't one, so the RPC's own default --
  // current_date as of 0040_assignment_scheduled_date_defaults.sql --
  // actually applies instead of being overridden by a null argument
  // (PostgREST/Postgres don't fall back to a function's default for an
  // explicitly-passed null, only for an omitted argument).
  const scheduledDate = (formData.get("scheduled_date") as string) || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_workout_to_client", {
    p_workout_id: workoutId,
    p_client_id: clientId,
    ...(scheduledDate ? { p_scheduled_date: scheduledDate } : {}),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/clients/${clientId}`);
  return data as string;
}

async function doAssignProgram(clientId: string, formData: FormData): Promise<string> {
  await requireCoach();
  const programId = String(formData.get("program_id") ?? "");
  if (!programId) throw new Error("Pick a program to assign.");

  const startDate = (formData.get("start_date") as string) || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_program_to_client", {
    p_program_id: programId,
    p_client_id: clientId,
    ...(startDate ? { p_start_date: startDate } : {}),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/clients/${clientId}`);
  return data as string;
}

async function doAssignDocument(clientId: string, formData: FormData): Promise<string> {
  await requireCoach();
  const documentId = String(formData.get("document_id") ?? "");
  if (!documentId) throw new Error("Pick a document to assign.");

  // See doAssignWorkout's comment on scheduledDate above.
  const scheduledDate = (formData.get("scheduled_date") as string) || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_document_to_client", {
    p_document_id: documentId,
    p_client_id: clientId,
    ...(scheduledDate ? { p_scheduled_date: scheduledDate } : {}),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/clients/${clientId}`);
  return data as string;
}

export async function assignWorkoutToClient(clientId: string, formData: FormData) {
  const path = `/dashboard/clients/${clientId}`;
  let newId: string;
  try {
    newId = await doAssignWorkout(clientId, formData);
  } catch (err) {
    redirect(`${path}?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  // Land the coach on what they just assigned, instead of leaving them to
  // hunt for it back on the client page.
  redirect(`${path}/assigned/workouts/${newId}`);
}

export async function assignProgramToClient(clientId: string, formData: FormData) {
  const path = `/dashboard/clients/${clientId}`;
  let newId: string;
  try {
    newId = await doAssignProgram(clientId, formData);
  } catch (err) {
    redirect(`${path}?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  redirect(`${path}/assigned/programs/${newId}`);
}

export async function assignDocumentToClient(clientId: string, formData: FormData) {
  const path = `/dashboard/clients/${clientId}`;
  let newId: string;
  try {
    newId = await doAssignDocument(clientId, formData);
  } catch (err) {
    redirect(`${path}?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
  redirect(`${path}/assigned/documents/${newId}`);
}

// Calendar-only: same RPCs, no redirect -- see this file's header comment.
export async function assignWorkoutToClientInline(clientId: string, formData: FormData): Promise<string> {
  return doAssignWorkout(clientId, formData);
}

export async function assignProgramToClientInline(clientId: string, formData: FormData): Promise<string> {
  return doAssignProgram(clientId, formData);
}

export async function assignDocumentToClientInline(clientId: string, formData: FormData): Promise<string> {
  return doAssignDocument(clientId, formData);
}
