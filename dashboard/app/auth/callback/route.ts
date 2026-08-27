import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postAuthDestination } from "@/lib/auth-redirect";

function toLogin(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}

// PKCE code-exchange callback. This works when the browser completing the
// redirect is the same one that requested it (e.g. an OAuth provider
// redirect, same tab) -- it needs the code_verifier cookie set on that
// original request. Email magic links don't reliably satisfy that (the
// link is often opened in a different browser/app than it was requested
// from), so those go through /auth/confirm instead, which doesn't depend
// on any locally-stored secret. Keeping this route around for future
// non-email flows (OAuth providers, etc.).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const authError = searchParams.get("error_description") || searchParams.get("error");

  if (authError) {
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

  const destination = await postAuthDestination(supabase);
  if (destination) return NextResponse.redirect(`${origin}${destination}`);

  return toLogin(
    origin,
    "Signed in, but no profile row was found for this account -- the signup trigger may not have run.",
  );
}
