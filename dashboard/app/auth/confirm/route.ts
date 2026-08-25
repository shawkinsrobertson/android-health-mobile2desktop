import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postAuthDestination } from "@/lib/auth-redirect";

function toLogin(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}

// Magic-link confirmation via token_hash + verifyOtp -- this is what
// /login and /join/[token] actually land on, via the customized "Magic
// Link" email template (see README section 4). Unlike /auth/callback's
// PKCE code exchange, this doesn't need any secret stored on the
// requesting browser: the token_hash from the emailed link is itself the
// credential, so it works no matter what browser/device/app opens it.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return toLogin(
      origin,
      "This link is missing its verification token. Make sure the Magic Link email template " +
        `points at "${origin}/auth/confirm?token_hash={{ .TokenHash }}&type=email" (see README).`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return toLogin(origin, error.message);
  }

  const destination = await postAuthDestination();
  if (destination) return NextResponse.redirect(`${origin}${destination}`);

  return toLogin(
    origin,
    "Signed in, but no profile row was found for this account -- the signup trigger may not have run.",
  );
}
