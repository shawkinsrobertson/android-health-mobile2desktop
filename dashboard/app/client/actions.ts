"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { DATA_POINT_KEYS, DATA_POINTS } from "./data-points";

export async function updateTopDataPoints(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") {
    throw new Error("Only clients can set this.");
  }

  const selected = formData
    .getAll("data_point")
    .map(String)
    .filter((key) => (DATA_POINT_KEYS as readonly string[]).includes(key))
    .slice(0, 3);

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_profiles")
    .update({ top_data_points: selected, updated_at: new Date().toISOString() })
    .eq("profile_id", profile.id);

  if (error) throw new Error(`Failed to save: ${error.message}`);

  revalidatePath("/client");
}

// Carried into every set logged during a workout session -- see
// components/library/SessionLogger.tsx.
export async function updateWeightUnit(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") {
    throw new Error("Only clients can set this.");
  }

  const unit = formData.get("preferred_weight_unit") === "kg" ? "kg" : "lbs";

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_profiles")
    .update({ preferred_weight_unit: unit, updated_at: new Date().toISOString() })
    .eq("profile_id", profile.id);

  if (error) throw new Error(`Failed to save: ${error.message}`);

  revalidatePath("/client");
}

// Visibility-only for now -- see 0014_client_data_consent.sql's header
// comment. Upserts all types every save (not just changed ones) so a row
// always exists per type, rather than leaning on "missing row means
// consented" as an implicit default.
export async function updateDataConsent(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") {
    throw new Error("Only clients can set this.");
  }

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.coachId) throw new Error("No coach assigned yet.");

  const supabase = await createClient();
  const now = new Date().toISOString();
  const rows = DATA_POINTS.map((d) => ({
    client_id: profile.id,
    coach_id: clientProfile.coachId as string,
    data_type: d.key,
    consented: formData.get(`consent_${d.key}`) === "on",
    updated_at: now,
  }));

  const { error } = await supabase
    .from("client_data_consent")
    .upsert(rows, { onConflict: "client_id,data_type" });

  if (error) throw new Error(`Failed to save: ${error.message}`);

  revalidatePath("/client");
  revalidatePath(`/dashboard/clients/${profile.id}`);
}
