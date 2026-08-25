import { getClientProfile, getCurrentProfile } from "./profile";

// Where to send someone right after they get a session, based on role and
// (for clients) onboarding state. Shared by every auth entry point --
// /auth/callback (PKCE code exchange) and /auth/confirm (token_hash
// verifyOtp) -- so "coach -> /dashboard, client -> /onboarding or /client"
// stays defined in exactly one place.
export async function postAuthDestination(): Promise<string | null> {
  const profile = await getCurrentProfile();

  if (profile?.role === "coach") return "/dashboard";

  if (profile?.role === "client") {
    const clientProfile = await getClientProfile(profile.id);
    return clientProfile?.onboardedAt ? "/client" : "/onboarding";
  }

  return null;
}
