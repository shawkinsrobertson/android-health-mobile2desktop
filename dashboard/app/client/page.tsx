import { redirect } from "next/navigation";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { getDataPointSummary } from "@/lib/queries";
import { DataPointPicker } from "@/components/DataPointPicker";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { labelFor } from "./data-points";

export const dynamic = "force-dynamic";

export default async function ClientDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const summaries = await Promise.all(
    clientProfile.topDataPoints.map(async (key) => ({
      key,
      summary: await getDataPointSummary(key, clientProfile.syncCode).catch(
        () => "Couldn't load this right now",
      ),
    })),
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">
          Hey{profile.fullName ? `, ${profile.fullName}` : ""}
        </h1>
        <p className="text-sm text-ink-secondary">Your dashboard.</p>
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Connect your phone</h2>
        <p className="mb-3 text-sm text-ink-secondary">
          Open the Health Sync app, enter this code once in Settings, and your synced Health
          Connect data will show up below.
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded-lg bg-[color:var(--page-plane)] px-3 py-2 font-mono text-lg tracking-widest text-ink-primary">
            {clientProfile.syncCode}
          </code>
          <CopyLinkButton url={clientProfile.syncCode} />
        </div>
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Your top data points</h2>
        <DataPointPicker initialSelected={clientProfile.topDataPoints} />
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        {summaries.length === 0 ? (
          <p className="text-sm text-ink-muted">Pick some data points above to see them here.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {summaries.map(({ key, summary }) => (
              <div
                key={key}
                className="rounded-lg bg-[color:var(--page-plane)] p-3 text-sm text-ink-secondary"
              >
                <div className="mb-1 font-medium text-ink-primary">{labelFor(key)}</div>
                {summary}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
