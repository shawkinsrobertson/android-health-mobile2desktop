"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

// Coach sign-in/sign-up entry point. Client accounts are never created
// here -- they only come through /join/[token] (see app/join), so an
// existing account with this email but role "client" would just get a
// magic link into a coach-shaped world; that's an edge case worth
// revisiting once cross-role accounts are actually a thing (see the
// planning conversation on this).
export async function sendCoachMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect(`/login?error=${encodeURIComponent("Enter an email address.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
      // Only applied if this creates a brand-new auth user; ignored for an
      // existing account. See handle_new_user() in the accounts migration.
      data: { role: "coach" },
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?sent=1");
}
