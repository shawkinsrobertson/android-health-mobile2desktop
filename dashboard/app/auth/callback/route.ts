import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";

// Lands here after a magic-link click. Exchanges the auth code for a
// session, then routes by role/onboarding state rather than trusting a
// query param -- coaches go to their dashboard, clients go to onboarding
// until it's complete and to their own dashboard after.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const profile = await getCurrentProfile();

      if (profile?.role === "coach") {
        return NextResponse.redirect(`${origin}/dashboard`);
      }

      if (profile?.role === "client") {
        const clientProfile = await getClientProfile(profile.id);
        const destination = clientProfile?.onboardedAt ? "/client" : "/onboarding";
        return NextResponse.redirect(`${origin}${destination}`);
      }
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That link didn't work -- request a new one.")}`,
  );
}
