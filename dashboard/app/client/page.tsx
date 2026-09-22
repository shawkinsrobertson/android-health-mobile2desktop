import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { getDataPointSummary } from "@/lib/queries";
import { resolveMediaPair } from "@/lib/media";
import { formatClock, sessionDurationSeconds } from "@/lib/time-format";
import { getPersonalRecords } from "@/lib/personal-records";
import { listEvents } from "@/lib/calendar";
import { rangeForView } from "@/lib/calendar-grid";
import { DataPointPicker } from "@/components/DataPointPicker";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { PersonalRecordsList } from "@/components/PersonalRecordsList";
import { CalendarCard } from "@/components/calendar/CalendarCard";
import { DATA_POINTS, labelFor } from "./data-points";
import { updateWeightUnit, updateDataConsent } from "./actions";

export const dynamic = "force-dynamic";

interface RecentSessionRow {
  id: string;
  assigned_workout_id: string;
  completed_at: string;
  started_at: string | null;
  total_paused_seconds: number | null;
  assigned_workouts: { name: string } | null;
}

function DumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-ink-muted" aria-hidden="true">
      <path
        d="M4 9v6M2 10v4M20 9v6M22 10v4M7 8v8M17 8v8M7 12h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function ClientDashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const summaries = await Promise.all(
    clientProfile.topDataPoints.map(async (key) => ({
      key,
      summary: await getDataPointSummary(supabase, key, profile.id).catch(
        () => "Couldn't load this right now",
      ),
    })),
  );

  // "Next" is a placeholder for real scheduling (not built yet) -- for now
  // it's just the most recently assigned standalone workout, same ordering
  // every other "assigned workouts" list in the app already uses.
  const [{ data: nextWorkout }, { data: recentSessionsRaw }] = await Promise.all([
    supabase
      .from("assigned_workouts")
      .select("id, name, photo_path, photo_url, video_path, video_url")
      .eq("client_id", profile.id)
      .is("assigned_program_id", null)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_sessions")
      .select("id, assigned_workout_id, completed_at, started_at, total_paused_seconds, assigned_workouts(name)")
      .eq("client_id", profile.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(5),
  ]);

  const recentSessions = (recentSessionsRaw ?? []) as unknown as RecentSessionRow[];

  const [nextWorkoutMedia, exerciseCountRes] = nextWorkout
    ? await Promise.all([
        resolveMediaPair(supabase, nextWorkout),
        supabase
          .from("assigned_workout_exercises")
          .select("id", { count: "exact", head: true })
          .eq("assigned_workout_id", nextWorkout.id),
      ])
    : [null, null];
  const exerciseCount = exerciseCountRes?.count ?? 0;

  const [personalRecords, { data: consentRows }, initialEvents, googleConnectionRes] = await Promise.all([
    getPersonalRecords(supabase, profile.id),
    supabase.from("client_data_consent").select("data_type, consented").eq("client_id", profile.id),
    listEvents(supabase, { clientId: profile.id }, rangeForView("month", new Date())),
    supabase
      .from("calendar_connections")
      .select("external_account_email, last_synced_at")
      .eq("profile_id", profile.id)
      .eq("provider", "google")
      .maybeSingle(),
  ]);
  const consentByType = Object.fromEntries((consentRows ?? []).map((r) => [r.data_type, r.consented]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">
          Hey{profile.fullName ? `, ${profile.fullName}` : ""}
        </h1>
        <p className="text-sm text-ink-secondary">Your dashboard.</p>
      </div>

      {nextWorkout ? (
        <Link
          href={`/client/assigned/workouts/${nextWorkout.id}`}
          className="flex items-center gap-3 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 hover:bg-[color:var(--page-plane)]"
        >
          {nextWorkoutMedia?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nextWorkoutMedia.photoUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[color:var(--page-plane)]">
              <DumbbellIcon />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xs font-medium text-ink-secondary">Next up</h2>
            <p className="truncate text-sm font-semibold text-ink-primary">{nextWorkout.name}</p>
            <p className="text-xs text-ink-muted">
              {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"}
            </p>
          </div>
        </Link>
      ) : (
        <Link
          href="/client/assigned"
          className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 hover:bg-[color:var(--page-plane)]"
        >
          <h2 className="text-sm font-semibold text-ink-primary">Your training</h2>
          <p className="mt-1 text-xs text-ink-secondary">
            See the workouts, programs, and documents your coach has assigned you.
          </p>
        </Link>
      )}

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-primary">Recent workouts</h2>
          <Link href="/client/history" className="text-xs text-[color:var(--series-steps)] hover:underline">
            See all
          </Link>
        </div>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-ink-muted">No finished workouts yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentSessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/client/assigned/workouts/${s.assigned_workout_id}/sessions/${s.id}/summary`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[color:var(--page-plane)]"
                >
                  <span className="truncate text-ink-primary">{s.assigned_workouts?.name ?? "Workout"}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {new Date(s.completed_at).toLocaleDateString()}
                    {" · "}
                    {formatClock(sessionDurationSeconds(s.started_at, s.completed_at, s.total_paused_seconds))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-primary">Personal records</h2>
          {personalRecords.length > 3 && (
            <Link
              href="/client/personal-records"
              className="text-xs text-[color:var(--series-steps)] hover:underline"
            >
              See all
            </Link>
          )}
        </div>
        <PersonalRecordsList
          records={personalRecords}
          weightUnit={clientProfile.preferredWeightUnit}
          limit={3}
        />
      </section>

      <CalendarCard
        scope={{ clientId: profile.id }}
        initialEvents={initialEvents}
        googleSync={{
          targetProfileId: profile.id,
          ownAccountEmail: googleConnectionRes.data?.external_account_email ?? null,
          lastSyncedAt: googleConnectionRes.data?.last_synced_at ?? null,
        }}
        creatorHasGoogleConnection={!!googleConnectionRes.data}
      />

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Connect your phone</h2>
        <p className="mb-3 text-sm text-ink-secondary">
          Open the Health Sync app and sign in with this email. You&apos;ll get a 6-digit code
          by email each time -- no password, and nothing to type in on the phone beyond that
          code. Your synced Health Connect data will show up below once it&apos;s connected.
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded-lg bg-[color:var(--page-plane)] px-3 py-2 font-mono text-sm text-ink-primary">
            {profile.email}
          </code>
          <CopyLinkButton url={profile.email} />
        </div>
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Your top data points</h2>
        <DataPointPicker initialSelected={clientProfile.topDataPoints} />
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Weight units</h2>
        <p className="mb-3 text-xs text-ink-secondary">Used when logging weight during a workout.</p>
        <form action={updateWeightUnit} className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink-primary">
            <input
              type="radio"
              name="preferred_weight_unit"
              value="lbs"
              defaultChecked={clientProfile.preferredWeightUnit === "lbs"}
            />
            lbs
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink-primary">
            <input
              type="radio"
              name="preferred_weight_unit"
              value="kg"
              defaultChecked={clientProfile.preferredWeightUnit === "kg"}
            />
            kg
          </label>
          <button
            type="submit"
            className="rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Save
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-primary">Data sharing</h2>
        <p className="mb-3 text-xs text-ink-secondary">
          Choose what your coach can see. Turning something off here is visible to your coach, but
          doesn&apos;t yet stop it from syncing from your phone.
        </p>
        <form action={updateDataConsent} className="flex flex-col gap-2">
          {DATA_POINTS.map((d) => (
            <label key={d.key} className="flex items-center gap-2 text-sm text-ink-primary">
              <input
                type="checkbox"
                name={`consent_${d.key}`}
                defaultChecked={consentByType[d.key] !== false}
              />
              {d.label}
            </label>
          ))}
          <button
            type="submit"
            className="mt-1 w-fit rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Save
          </button>
        </form>
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
