import { SleepChart } from "@/components/SleepChart";
import { StatCard } from "@/components/StatCard";
import { StepsChart } from "@/components/StepsChart";
import { getDailySteps, getOverviewStats, getSleepNights } from "@/lib/queries";

// This page always reflects live Supabase data (synced from your device
// on its own schedule), so it should never be statically prerendered —
// force a per-request fetch instead of a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [stats, steps, sleep] = await Promise.all([
    getOverviewStats(),
    getDailySteps(14),
    getSleepNights(14),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Steps today" value={stats.stepsToday.toLocaleString()} />
        <StatCard
          label="Avg heart rate (7d)"
          value={stats.avgHeartRate7d ? `${stats.avgHeartRate7d} bpm` : "—"}
        />
        <StatCard label="Last sleep" value={stats.lastSleepHours ? `${stats.lastSleepHours}h` : "—"} />
        <StatCard label="Workouts (7d)" value={String(stats.exerciseSessions7d)} />
      </div>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-medium text-ink-secondary">Steps, last 14 days</h2>
        <StepsChart data={steps} />
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-2 text-sm font-medium text-ink-secondary">Sleep, last 14 days</h2>
        <SleepChart data={sleep} />
      </section>
    </div>
  );
}
