"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

// formData is optional in practice -- the Dashboard quick-action card's
// own bare `<form action={createInviteLink}>` (no fields) still works
// unchanged, just with client_name left null. Only the Clients page's
// named-link modal actually sets it.
export async function createInviteLink(formData?: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") {
    throw new Error("Only coaches can generate invite links.");
  }

  const clientName = (formData?.get("client_name") as string | null)?.trim() || null;

  const token = randomBytes(24).toString("base64url");
  const supabase = await createClient();
  const { error } = await supabase
    .from("invite_links")
    .insert({ token, coach_id: profile.id, client_name: clientName });

  if (error) throw new Error(`Failed to create invite link: ${error.message}`);

  // Generate-invite-link UI is duplicated on both the Dashboard quick
  // actions and the Clients page's own invite section.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
}
