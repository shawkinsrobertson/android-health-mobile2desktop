import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientProfile, getCurrentProfile } from "./profile";

// Where to send someone right after they get a session, based on role and
// (for clients) onboarding state. Shared by every auth entry point --
// /auth/callback (PKCE code exchange) and /auth/confirm (token_hash
// verifyOtp) -- so "coach -> /dashboard, client -> /onboarding or /client"
// stays defined in exactly one place.
//
// Pass the same client that just established the session (verifyOtp/
// exchangeCodeForSession) rather than letting this create its own -- see
// the comment on getCurrentProfile() for why that matters.
export async function postAuthDestination(client: SupabaseClient): Promise<string | null> {
  const profile = await getCurrentProfile(client);

  if (profile?.role === "coach") return "/dashboard";

  if (profile?.role === "client") {
    const clientProfile = await getClientProfile(profile.id, client);
    return clientProfile?.onboardedAt ? "/client" : "/onboarding";
  }

  return null;
}
