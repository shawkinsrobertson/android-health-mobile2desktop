import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { ensureCurrentCheckInOccurrence, getActiveCheckInSeries } from "@/lib/check-ins";

export const dynamic = "force-dynamic";

// Resolves to whichever occurrence is actually due right now, then hands
// off to the real per-occurrence page -- see
// app/client/check-in/[assignmentId]/page.tsx. Kept as its own route
// (rather than folding this into that one) so the home screen's Tasks
// link and anywhere else in the app can keep linking to a single,
// un-parameterized "my check-in" URL.
export default async function ClientCheckInRedirectPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();
  const series = await getActiveCheckInSeries(supabase, profile.id);
  if (!series) redirect("/client");

  const occurrenceId = await ensureCurrentCheckInOccurrence(supabase, series);
  if (!occurrenceId) redirect("/client");

  redirect(`/client/check-in/${occurrenceId}`);
}
