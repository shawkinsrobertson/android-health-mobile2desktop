import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { getPersonalRecords } from "@/lib/personal-records";
import { PersonalRecordsList } from "@/components/PersonalRecordsList";

export const dynamic = "force-dynamic";

export default async function ClientPersonalRecordsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();
  const records = await getPersonalRecords(supabase, profile.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/client" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">Personal records</h1>
        <p className="text-sm text-ink-secondary">
          Your heaviest logged weight for each exercise, across every finished workout.
        </p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <PersonalRecordsList records={records} weightUnit={clientProfile.preferredWeightUnit} />
      </section>
    </div>
  );
}
