"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

export async function requestClientMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();

  if (!email || !token) {
    redirect(`/join/${token}?error=${encodeURIComponent("Enter an email address.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      // Consumed by handle_new_user() to link this account to the inviting
      // coach -- see the accounts migration.
      data: { role: "client", invite_token: token },
    },
  });

  if (error) {
    redirect(`/join/${token}?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/join/${token}?sent=1`);
}
