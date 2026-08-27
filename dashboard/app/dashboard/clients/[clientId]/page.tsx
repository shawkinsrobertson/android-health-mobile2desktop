import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { getDataPointSummary } from "@/lib/queries";
import { labelFor } from "@/app/client/data-points";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { clientId: string } }) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  // getClientProfile doesn't filter by coach itself -- RLS does that (a
  // coach can only select client_profiles rows where coach_id = them), so
  // a mistyped or someone-else's-client id in the URL just comes back
  // null here rather than leaking another coach's client.
  const [clientProfile, profileRes] = await Promise.all([
    getClientProfile(params.clientId, supabase),
    supabase.from("profiles").select("full_name, email").eq("id", params.clientId).single(),
  ]);

  if (!clientProfile || clientProfile.coachId !== coach.id || profileRes.error) {
    redirect("/dashboard");
  }

  const client = profileRes.data;

  const summaries = clientProfile.onboardedAt
    ? await Promise.all(
        clientProfile.topDataPoints.map(async (key) => ({
          key,
          summary: await getDataPointSummary(key, clientProfile.syncCode).catch(
            () => "Couldn't load this right now",
          ),
        })),
      )
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Clients
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">
          {client?.full_name || client?.email || "Client"}
        </h1>
        <p className="text-sm text-ink-secondary">{client?.email}</p>
      </div>

      {!clientProfile.onboardedAt ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          Invited, but hasn&apos;t finished setting up their account yet.
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-primary">About</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Phone</dt>
                <dd className="text-ink-primary">{clientProfile.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Sync code</dt>
                <dd className="font-mono text-ink-primary">{clientProfile.syncCode}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ink-muted">Goals</dt>
                <dd className="text-ink-primary">{clientProfile.goals || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ink-muted">Injuries / limitations</dt>
                <dd className="text-ink-primary">{clientProfile.limitations || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-primary">Synced data</h2>
            {summaries.length === 0 ? (
              <p className="text-sm text-ink-muted">
                They haven&apos;t picked any data points to feature yet.
              </p>
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
        </>
      )}
    </div>
  );
}
