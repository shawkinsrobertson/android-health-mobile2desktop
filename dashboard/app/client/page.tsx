import { redirect } from "next/navigation";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { DataPointPicker } from "@/components/DataPointPicker";
import { labelFor } from "./data-points";

export const dynamic = "force-dynamic";

export default async function ClientDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">
          Hey{profile.fullName ? `, ${profile.fullName}` : ""}
        </h1>
        <p className="text-sm text-ink-secondary">Your dashboard.</p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Your top data points</h2>
        <DataPointPicker initialSelected={clientProfile.topDataPoints} />
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        {clientProfile.topDataPoints.length === 0 ? (
          <p className="text-sm text-ink-muted">Pick some data points above to see them here.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {clientProfile.topDataPoints.map((key) => (
              <div
                key={key}
                className="rounded-lg bg-[color:var(--page-plane)] p-3 text-sm text-ink-secondary"
              >
                <div className="mb-1 font-medium text-ink-primary">{labelFor(key)}</div>
                Synced data isn&apos;t linked to your account yet -- once your mobile app is set
                up to sync as you, this will show your numbers.
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
