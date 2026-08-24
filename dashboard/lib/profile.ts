import { createClient } from "./supabase/server";

export interface Profile {
  id: string;
  role: "coach" | "client";
  email: string;
  fullName: string | null;
}

export interface ClientProfile {
  coachId: string | null;
  phone: string | null;
  goals: string | null;
  limitations: string | null;
  topDataPoints: string[];
  onboardedAt: string | null;
}

// Fetches the signed-in user's profile row, or null if not signed in. Used
// by protected pages to authorize + personalize; middleware only checks
// "is there a session at all", so every protected page still needs this.
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  return { id: data.id, role: data.role, email: data.email, fullName: data.full_name };
}

export async function getClientProfile(profileId: string): Promise<ClientProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_profiles")
    .select("coach_id, phone, goals, limitations, top_data_points, onboarded_at")
    .eq("profile_id", profileId)
    .single();

  if (error || !data) return null;

  return {
    coachId: data.coach_id,
    phone: data.phone,
    goals: data.goals,
    limitations: data.limitations,
    topDataPoints: data.top_data_points ?? [],
    onboardedAt: data.onboarded_at,
  };
}
