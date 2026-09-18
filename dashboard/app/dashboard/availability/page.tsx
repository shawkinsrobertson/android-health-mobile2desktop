import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getCoachAvailability } from "@/lib/booking";
import { AvailabilityEditor } from "@/components/booking/AvailabilityEditor";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const availability = await getCoachAvailability(supabase, profile.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Availability</h1>
        <p className="text-sm text-ink-secondary">
          Set your weekly hours -- this is what people booking through your link see as open.
        </p>
      </div>
      <AvailabilityEditor initial={availability} />
    </div>
  );
}
