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

export async function addCoachNote(clientId: string, formData: FormData) {
  const coach = await requireCoach();
  const path = `/dashboard/clients/${clientId}`;

  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(`${path}?error=${encodeURIComponent("Note can't be empty.")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("coach_notes").insert({
    coach_id: coach.id,
    client_id: clientId,
    body,
    is_private: formData.get("is_private") === "on",
  });

  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(path);
}

export async function deleteCoachNote(clientId: string, noteId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase.from("coach_notes").delete().eq("id", noteId).eq("coach_id", coach.id);

  revalidatePath(`/dashboard/clients/${clientId}`);
}
