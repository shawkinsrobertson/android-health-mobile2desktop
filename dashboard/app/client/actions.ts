"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { DATA_POINT_KEYS } from "./data-points";

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
