"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { parseFormSchema } from "@/lib/forms";

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
  return profile;
}

// Coach creates or edits their one recurring check-in for this client --
// see 0023_check_ins.sql's unique(coach_id, client_id) for why this is an
// upsert onto a single row rather than an insert-a-new-template-each-time.
export async function saveCheckInTemplate(clientId: string, formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim() || "Weekly Check-In";
  const dayOfWeek = Number(formData.get("day_of_week") ?? 0);
  const active = formData.get("active") === "on";

  let form_schema;
  try {
    form_schema = parseFormSchema(formData.get("form_schema"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't save the check-in.";
    redirect(`/dashboard/clients/${clientId}?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("check_in_templates").upsert(
    {
      coach_id: coach.id,
      client_id: clientId,
      name,
      form_schema,
      day_of_week: Number.isFinite(dayOfWeek) ? dayOfWeek : 0,
      active,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "coach_id,client_id" },
  );

  if (error) {
    redirect(`/dashboard/clients/${clientId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
}

export async function deleteCheckInTemplate(clientId: string, templateId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  await supabase.from("check_in_templates").delete().eq("id", templateId).eq("coach_id", coach.id);

  revalidatePath(`/dashboard/clients/${clientId}`);
}
