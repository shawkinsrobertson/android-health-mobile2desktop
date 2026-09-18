import { redirect } from "next/navigation";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { DATA_POINTS } from "@/app/client/data-points";
import { completeOnboarding } from "./actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (clientProfile?.onboardedAt) redirect("/client");

  const { error } = searchParams;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-lg font-semibold text-ink-primary">Tell us about you</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Your coach will see this. A couple of these are optional -- fill in what&apos;s useful.
      </p>

      <form action={completeOnboarding} className="flex flex-col gap-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Name
          <input
            name="full_name"
            required
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Phone <span className="text-ink-muted">(optional)</span>
          <input
            name="phone"
            type="tel"
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Goals <span className="text-ink-muted">(optional)</span>
          <textarea
            name="goals"
            rows={3}
            placeholder="What are you training toward?"
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Injuries or limitations <span className="text-ink-muted">(optional)</span>
          <textarea
            name="limitations"
            rows={3}
            placeholder="Anything your coach should know about before programming for you?"
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <fieldset className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-hairline)] p-3">
          <legend className="px-1 text-xs font-medium text-ink-secondary">Share with your coach</legend>
          <p className="mb-1 text-xs text-ink-muted">
            Everything is shared by default -- turn off anything you&apos;d rather keep private. You
            can change this anytime from your dashboard.
          </p>
          {DATA_POINTS.map((d) => (
            <label key={d.key} className="flex items-center gap-2 text-sm text-ink-primary">
              <input type="checkbox" name={`consent_${d.key}`} defaultChecked />
              {d.label}
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          className="rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
