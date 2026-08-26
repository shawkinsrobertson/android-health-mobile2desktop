import type { SupabaseClient } from "@supabase/supabase-js";
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
  // Links this account to a specific Android install's synced rows -- see
  // supabase/migrations/0003_sync_code.sql.
  syncCode: string;
}

// Fetches the signed-in user's profile row, or null if not signed in. Used
// by protected pages to authorize + personalize; middleware only checks
// "is there a session at all", so every protected page still needs this.
//
// Accepts an optional existing client so callers that just established a
// session on their own client (verifyOtp/exchangeCodeForSession -- see
// app/auth/confirm and app/auth/callback) can reuse it instead of creating
// a fresh one. That matters: a fresh createClient() has to reconstitute
// the session by re-reading cookies, and in a Route Handler the cookies
// you just wrote via setAll() aren't guaranteed to be visible to a
// separate client instance's read within the same request -- reusing the
// client that already holds the session in memory sidesteps that
// entirely, and matches Supabase's own documented pattern for these routes.
export async function getCurrentProfile(client?: SupabaseClient): Promise<Profile | null> {
  const supabase = client ?? (await createClient());
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

export async function getClientProfile(
  profileId: string,
  client?: SupabaseClient,
): Promise<ClientProfile | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("client_profiles")
    .select("coach_id, phone, goals, limitations, top_data_points, onboarded_at, sync_code")
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
    syncCode: data.sync_code,
  };
}
