import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

// No form here anymore -- creating a workout and editing it (title, media,
// description, exercises) now happen on one screen, [workoutId]/page.tsx.
// Visiting this route mints a blank draft and hands off to that screen
// immediately, the same "create first, then edit in place" shape already
// established for AI-drafted workouts (see lib/workout-drafting.ts).
export default async function NewWorkoutPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .insert({ coach_id: profile.id, type: "workout", status: "draft", name: "New workout" })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/dashboard/library/workouts?error=${encodeURIComponent("Failed to create workout.")}`);
  }

  redirect(`/dashboard/library/workouts/${data.id}`);
}
