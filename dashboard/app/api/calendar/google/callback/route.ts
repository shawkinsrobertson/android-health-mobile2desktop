import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { exchangeCodeForTokens, getConnectedAccountEmail } from "@/lib/google-calendar";
import { encryptToken } from "@/lib/calendar-crypto";

// This is a *third-party* token exchange, not Supabase's own -- deliberately
// kept separate from app/auth/callback/route.ts, which handles Supabase
// Auth's own OAuth/PKCE flow. Different provider, different token shape,
// different storage (calendar_connections, not a Supabase session).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.redirect(`${origin}/login`);

  const returnTo = profile.role === "coach" ? "/dashboard" : "/client";
  function toReturn(message?: string) {
    const url = new URL(returnTo, origin);
    if (message) url.searchParams.set("calendar_error", message);
    return NextResponse.redirect(url);
  }

  if (oauthError) return toReturn(oauthError);
  if (!code || !state) return toReturn("Missing authorization code.");

  const cookieState = (await cookies()).get("google_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return toReturn("That connection attempt expired -- try again.");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (e) {
    return toReturn(e instanceof Error ? e.message : "Failed to connect Google Calendar.");
  }

  if (!tokens.refreshToken) {
    // Shouldn't happen given access_type=offline&prompt=consent, but if
    // Google ever omits it (e.g. an already-consented client without
    // prompt=consent taking effect), there's nothing to persist a
    // session with -- better to say so than silently store a
    // connection that can't outlive one access token.
    return toReturn("Google didn't grant lasting access -- try connecting again.");
  }

  const email = await getConnectedAccountEmail(tokens.accessToken);

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("calendar_connections").upsert(
    {
      profile_id: profile.id,
      provider: "google",
      access_token: encryptToken(tokens.accessToken),
      refresh_token: encryptToken(tokens.refreshToken),
      expires_at: tokens.expiresAt.toISOString(),
      scope: tokens.scope,
      external_account_email: email,
      // Reconnecting (e.g. after a revoke) should re-sync from scratch,
      // not resume a syncToken from a now-disconnected session.
      sync_token: null,
      last_synced_at: null,
    },
    { onConflict: "profile_id,provider" },
  );

  if (dbError) return toReturn(dbError.message);

  const response = toReturn();
  response.cookies.delete("google_oauth_state");
  return response;
}
