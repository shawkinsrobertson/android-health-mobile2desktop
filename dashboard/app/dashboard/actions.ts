"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function createInviteLink() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") {
    throw new Error("Only coaches can generate invite links.");
  }

  const token = randomBytes(24).toString("base64url");
  const supabase = await createClient();
  const { error } = await supabase
    .from("invite_links")
    .insert({ token, coach_id: profile.id });

  if (error) throw new Error(`Failed to create invite link: ${error.message}`);

  revalidatePath("/dashboard");
}
