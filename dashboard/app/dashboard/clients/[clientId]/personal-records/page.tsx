import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { getPersonalRecords } from "@/lib/personal-records";
import { PersonalRecordsList } from "@/components/PersonalRecordsList";

export const dynamic = "force-dynamic";

export default async function CoachClientPersonalRecordsPage({
  params,
}: {
  params: { clientId: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const [clientProfile, profileRes] = await Promise.all([
    getClientProfile(params.clientId, supabase),
    supabase.from("profiles").select("full_name, email").eq("id", params.clientId).single(),
  ]);

  if (!clientProfile || clientProfile.coachId !== coach.id || profileRes.error) {
    redirect("/dashboard");
  }

  const client = profileRes.data;
  const records = await getPersonalRecords(supabase, params.clientId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← {client?.full_name || client?.email || "Client"}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">Personal records</h1>
        <p className="text-sm text-ink-secondary">
          Heaviest logged weight per exercise, across every finished workout.
        </p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <PersonalRecordsList records={records} weightUnit={clientProfile.preferredWeightUnit} />
      </section>
    </div>
  );
}
