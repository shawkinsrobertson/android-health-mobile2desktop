"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export async function completeOnboarding(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") {
    redirect("/login");
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const goals = String(formData.get("goals") ?? "").trim();
  const limitations = String(formData.get("limitations") ?? "").trim();

  if (!fullName) {
    redirect(`/onboarding?error=${encodeURIComponent("Let us know your name.")}`);
  }

  const supabase = await createClient();

  const [profileUpdate, clientUpdate] = await Promise.all([
    supabase.from("profiles").update({ full_name: fullName }).eq("id", profile.id),
    supabase
      .from("client_profiles")
      .update({
        phone: phone || null,
        goals: goals || null,
        limitations: limitations || null,
        onboarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", profile.id),
  ]);

  if (profileUpdate.error || clientUpdate.error) {
    const message = profileUpdate.error?.message ?? clientUpdate.error?.message ?? "Unknown error";
    redirect(`/onboarding?error=${encodeURIComponent(message)}`);
  }

  redirect("/client");
}
