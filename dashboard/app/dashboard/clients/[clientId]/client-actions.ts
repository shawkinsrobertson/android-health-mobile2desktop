"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

async function requireOwnClient(clientId: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_profiles")
    .select("coach_id")
    .eq("profile_id", clientId)
    .single();
  if (error || !data || data.coach_id !== profile.id) redirect("/dashboard/clients");

  return supabase;
}

// Soft-delete only -- see 0043_client_archive.sql's own comment for why a
// real delete isn't offered here at all. Archiving redirects away from
// the client's own detail page since it immediately drops out of the
// default roster query below; unarchiving (from the roster page's
// "Archived clients" section) stays put, since that page still shows it.
export async function archiveClient(clientId: string) {
  const supabase = await requireOwnClient(clientId);
  const { error } = await supabase
    .from("client_profiles")
    .update({ archived_at: new Date().toISOString() })
    .eq("profile_id", clientId);
  if (error) redirect(`/dashboard/clients/${clientId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/dashboard/clients");
  redirect("/dashboard/clients");
}

export async function unarchiveClient(clientId: string) {
  const supabase = await requireOwnClient(clientId);
  const { error } = await supabase
    .from("client_profiles")
    .update({ archived_at: null })
    .eq("profile_id", clientId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/clients");
}
