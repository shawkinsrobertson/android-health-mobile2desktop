import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentProfile } from "@/lib/profile";
import { buildGoogleAuthUrl } from "@/lib/google-calendar";

// Kicks off the OAuth flow for whoever is currently signed in connecting
// *their own* Google account -- there's no "connect on behalf of
// someone else" path, so no params beyond the session itself.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.redirect(`${origin}/login`);

  // A random nonce checked against the callback's own state param --
  // stops a third party from tricking a signed-in user into completing
  // someone else's OAuth flow (classic CSRF-on-OAuth-callback).
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
