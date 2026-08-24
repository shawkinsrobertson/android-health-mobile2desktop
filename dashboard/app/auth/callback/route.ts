import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";

function toLogin(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}

// Lands here after a magic-link click. Exchanges the auth code for a
// session, then routes by role/onboarding state rather than trusting a
// query param -- coaches go to their dashboard, clients go to onboarding
// until it's complete and to their own dashboard after.
//
// Every failure branch below carries the *actual* reason to /login?error=
// instead of one generic message -- magic-link callbacks fail for several
// distinct reasons (redirect URL not allowlisted in Supabase, an expired
// or already-used link, a PKCE code-verifier mismatch when the link is
// opened in a different browser/context than it was requested from, or a
// missing profile row) and a single swallowed message makes those
// impossible to tell apart from the outside.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const authError = searchParams.get("error_description") || searchParams.get("error");

  if (authError) {
    // Supabase itself rejected the link before issuing a code -- most often
    // an expired/already-used link, or (if this fires immediately after
    // clicking a fresh link) the redirect URL not being in Supabase's
    // Authentication -> URL Configuration allowlist.
    return toLogin(origin, authError);
  }

  if (!code) {
    return toLogin(
      origin,
      `No auth code came back from Supabase. Check Authentication -> URL Configuration in your ` +
        `Supabase project includes "${origin}/auth/callback" in the redirect URL allowlist.`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return toLogin(origin, error.message);
  }

  const profile = await getCurrentProfile();

  if (profile?.role === "coach") {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  if (profile?.role === "client") {
    const clientProfile = await getClientProfile(profile.id);
    const destination = clientProfile?.onboardedAt ? "/client" : "/onboarding";
    return NextResponse.redirect(`${origin}${destination}`);
  }

  return toLogin(
    origin,
    "Signed in, but no profile row was found for this account -- the signup trigger may not have run.",
  );
}
