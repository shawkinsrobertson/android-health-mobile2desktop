"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export interface CoachNoteRow {
  id: string;
  body: string;
  is_private: boolean;
  created_at: string;
}

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
  return profile;
}

// Called directly from CoachNotes.tsx (not a <form> submission), so it can
// hand back the created row for the component to prepend to its own list
// and clear the textarea -- same direct-call-plus-local-state pattern
// chat/session logging already use.
export async function addCoachNote(clientId: string, formData: FormData): Promise<CoachNoteRow> {
  const coach = await requireCoach();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Note can't be empty.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_notes")
    .insert({
      coach_id: coach.id,
      client_id: clientId,
      body,
      is_private: formData.get("is_private") === "on",
    })
    .select("id, body, is_private, created_at")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to add note.");

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/notes`);
  return data as CoachNoteRow;
}

export async function updateCoachNote(
  clientId: string,
  noteId: string,
  formData: FormData,
): Promise<CoachNoteRow> {
  const coach = await requireCoach();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Note can't be empty.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_notes")
    .update({
      body,
      is_private: formData.get("is_private") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("coach_id", coach.id)
    .select("id, body, is_private, created_at")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update note.");

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/notes`);
  return data as CoachNoteRow;
}

export async function deleteCoachNote(clientId: string, noteId: string): Promise<void> {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase.from("coach_notes").delete().eq("id", noteId).eq("coach_id", coach.id);

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/notes`);
}
