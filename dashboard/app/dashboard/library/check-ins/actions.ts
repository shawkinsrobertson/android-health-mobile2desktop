"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { parseFormSchema } from "@/lib/forms";

const LIST_PATH = "/dashboard/library/check-ins";

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
  return profile;
}

function strOrNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

export async function createCheckIn(formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim() || "Weekly Check-In";
  const description = strOrNull(formData.get("description"));

  const supabase = await createClient();
  let newId: string;
  try {
    const form_schema = parseFormSchema(formData.get("form_schema"));

    const { data, error } = await supabase
      .from("templates")
      .insert({
        coach_id: coach.id,
        type: "check_in",
        name,
        description,
        form_schema,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create check-in");
    newId = data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create check-in";
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${newId}`);
}

export async function updateCheckIn(checkInId: string, formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim() || "Weekly Check-In";
  const description = strOrNull(formData.get("description"));

  const supabase = await createClient();

  try {
    const form_schema = parseFormSchema(formData.get("form_schema"));

    const { error } = await supabase
      .from("templates")
      .update({ name, description, form_schema, updated_at: new Date().toISOString() })
      .eq("id", checkInId)
      .eq("type", "check_in")
      .eq("coach_id", coach.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save check-in";
    redirect(`${LIST_PATH}/${checkInId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${checkInId}`);
}

export async function deleteCheckIn(checkInId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", checkInId)
    .eq("type", "check_in")
    .eq("coach_id", coach.id);

  if (error) {
    redirect(`${LIST_PATH}/${checkInId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
