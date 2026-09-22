import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { getDailySteps, getDataPointSummary, getOverviewStats, getSleepNights } from "@/lib/queries";
import { getThreadReadOnly, isThreadUnread } from "@/lib/chat";
import { getPersonalRecords } from "@/lib/personal-records";
import { listEvents } from "@/lib/calendar";
import { rangeForView } from "@/lib/calendar-grid";
import { DATA_POINTS, labelFor } from "@/app/client/data-points";
import { StatCard } from "@/components/StatCard";
import { StepsChart } from "@/components/StepsChart";
import { SleepChart } from "@/components/SleepChart";
import { PersonalRecordsList } from "@/components/PersonalRecordsList";
import { CalendarCard } from "@/components/calendar/CalendarCard";
import { assignWorkoutToClient, assignProgramToClient, assignDocumentToClient } from "./assign-actions";
import { CoachNotes } from "@/components/CoachNotes";
import type { CoachNoteRow } from "./notes-actions";
import { AssistantChat } from "@/components/AssistantChat";
import { getAssistantMessages } from "@/lib/assistant";

export const dynamic = "force-dynamic";

interface AssignedRow {
  id: string;
  name: string;
  assigned_at: string;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { error?: string };
}) {
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
  const thread = await getThreadReadOnly(supabase, coach.id, params.clientId);
  const chatUnread = thread ? isThreadUnread(thread, "coach") : false;

  const [summaries, stats, steps, sleep] = clientProfile.onboardedAt
    ? await Promise.all([
        Promise.all(
          clientProfile.topDataPoints.map(async (key) => ({
            key,
            summary: await getDataPointSummary(supabase, key, params.clientId).catch(
              () => "Couldn't load this right now",
            ),
          })),
        ),
        getOverviewStats(supabase, params.clientId).catch(() => null),
        getDailySteps(supabase, 14, params.clientId).catch(() => []),
        getSleepNights(supabase, 14, params.clientId).catch(() => []),
      ])
    : [[], null, [], []];

  const [
    libraryWorkoutsRes,
    libraryProgramsRes,
    libraryDocumentsRes,
    assignedWorkoutsRes,
    assignedProgramsRes,
    assignedDocumentsRes,
    coachNotesRes,
    coachNotesCountRes,
    coachGoogleConnectionRes,
  ] = await Promise.all([
    supabase.from("library_workouts").select("id, name").eq("coach_id", coach.id).order("name"),
    supabase.from("library_programs").select("id, name").eq("coach_id", coach.id).order("name"),
    supabase.from("library_documents").select("id, name").eq("coach_id", coach.id).order("name"),
    supabase
      .from("assigned_workouts")
      .select("id, name, assigned_at")
      .eq("client_id", params.clientId)
      .is("assigned_program_id", null)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("assigned_programs")
      .select("id, name, assigned_at")
      .eq("client_id", params.clientId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("assigned_documents")
      .select("id, name, assigned_at")
      .eq("client_id", params.clientId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("coach_notes")
      .select("id, body, is_private, created_at")
      .eq("coach_id", coach.id)
      .eq("client_id", params.clientId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("coach_notes")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coach.id)
      .eq("client_id", params.clientId),
    supabase
      .from("calendar_connections")
      .select("id")
      .eq("profile_id", coach.id)
      .eq("provider", "google")
      .maybeSingle(),
  ]);

  const libraryWorkouts = (libraryWorkoutsRes.data ?? []) as { id: string; name: string }[];
  const libraryPrograms = (libraryProgramsRes.data ?? []) as { id: string; name: string }[];
  const libraryDocuments = (libraryDocumentsRes.data ?? []) as { id: string; name: string }[];
  const assignedWorkouts = (assignedWorkoutsRes.data ?? []) as AssignedRow[];
  const coachNotes = (coachNotesRes.data ?? []) as CoachNoteRow[];
  const coachNotesCount = coachNotesCountRes.count ?? coachNotes.length;
  const assignedPrograms = (assignedProgramsRes.data ?? []) as AssignedRow[];
  const assignedDocuments = (assignedDocumentsRes.data ?? []) as AssignedRow[];

  const [personalRecords, { data: consentRows }, calendarEvents, assistantMessages] = clientProfile.onboardedAt
    ? await Promise.all([
        getPersonalRecords(supabase, params.clientId),
        supabase
          .from("client_data_consent")
          .select("data_type, consented")
          .eq("client_id", params.clientId),
        listEvents(supabase, { clientId: params.clientId }, rangeForView("month", new Date())),
        getAssistantMessages(supabase, coach.id, params.clientId),
      ])
    : [[], { data: [] as { data_type: string; consented: boolean }[] }, [], []];
  const consentByType = Object.fromEntries((consentRows ?? []).map((r) => [r.data_type, r.consented]));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Clients
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-lg font-semibold text-ink-primary">
            {client?.full_name || client?.email || "Client"}
          </h1>
          <Link
            href={`/dashboard/clients/${params.clientId}/chat`}
            className="relative text-ink-secondary hover:text-ink-primary"
            aria-label="Chat with this client"
          >
            💬
            {chatUnread && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-yellow-400" aria-label="Unread messages" />
            )}
          </Link>
        </div>
        <p className="text-sm text-ink-secondary">{client?.email}</p>
      </div>

      {!clientProfile.onboardedAt ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          Invited, but hasn&apos;t finished setting up their account yet.
        </p>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Steps today" value={stats.stepsToday.toLocaleString()} />
              <StatCard
                label="Avg heart rate (7d)"
                value={stats.avgHeartRate7d ? `${stats.avgHeartRate7d} bpm` : "—"}
              />
              <StatCard
                label="Last sleep"
                value={stats.lastSleepHours ? `${stats.lastSleepHours}h` : "—"}
              />
              <StatCard label="Workouts (7d)" value={String(stats.exerciseSessions7d)} />
            </div>
          )}

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-2 text-sm font-medium text-ink-secondary">Steps, last 14 days</h2>
            <StepsChart data={steps} />
          </section>

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-2 text-sm font-medium text-ink-secondary">Sleep, last 14 days</h2>
            <SleepChart data={sleep} />
          </section>

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

          <CalendarCard
            scope={{ clientId: params.clientId }}
            initialEvents={calendarEvents}
            fixedClientId={params.clientId}
            title="Shared calendar"
            googleSync={{ targetProfileId: params.clientId }}
            creatorHasGoogleConnection={!!coachGoogleConnectionRes.data}
          />

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold text-ink-primary">Data sharing</h2>
            <p className="mb-3 text-xs text-ink-muted">
              What this client has chosen to share with you. Read-only -- they set this from their
              own dashboard.
            </p>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {DATA_POINTS.map((d) => {
                const consented = consentByType[d.key] !== false;
                return (
                  <li key={d.key} className="flex items-center gap-2 text-ink-primary">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        consented ? "bg-[color:var(--series-steps)]" : "bg-ink-muted"
                      }`}
                      aria-hidden="true"
                    />
                    <span className={consented ? "" : "text-ink-muted"}>{d.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold text-ink-primary">Coach notes</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Only you see these. Mark a note private to keep it out of the AI assistant&apos;s context too.
            </p>
            <CoachNotes
              clientId={params.clientId}
              initialNotes={coachNotes}
              seeAllHref={`/dashboard/clients/${params.clientId}/notes`}
              totalCount={coachNotesCount}
            />
          </section>

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-1 text-sm font-semibold text-ink-primary">AI assistant</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Grounded in this client&apos;s synced data and your non-private notes. Only you see this
              conversation.
            </p>
            <AssistantChat
              clientId={params.clientId}
              initialMessages={assistantMessages.map((m) => ({ role: m.role, content: m.content }))}
            />
          </section>

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-primary">Personal records</h2>
              {personalRecords.length > 3 && (
                <Link
                  href={`/dashboard/clients/${params.clientId}/personal-records`}
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

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-primary">
              Featured data points (client&apos;s picks)
            </h2>
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

          {searchParams.error && (
            <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
          )}

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-primary">Assign content</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <AssignForm
                label="Workout"
                emptyLabel="No workouts in your library yet."
                fieldName="workout_id"
                options={libraryWorkouts}
                action={assignWorkoutToClient.bind(null, params.clientId)}
              />
              <AssignForm
                label="Program"
                emptyLabel="No programs in your library yet."
                fieldName="program_id"
                options={libraryPrograms}
                action={assignProgramToClient.bind(null, params.clientId)}
              />
              <AssignForm
                label="Document"
                emptyLabel="No documents in your library yet."
                fieldName="document_id"
                options={libraryDocuments}
                action={assignDocumentToClient.bind(null, params.clientId)}
              />
            </div>
          </section>

          <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-primary">Assigned content</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <AssignedList
                title="Workouts"
                items={assignedWorkouts}
                hrefFor={(id) => `/dashboard/clients/${params.clientId}/assigned/workouts/${id}`}
              />
              <AssignedList
                title="Programs"
                items={assignedPrograms}
                hrefFor={(id) => `/dashboard/clients/${params.clientId}/assigned/programs/${id}`}
              />
              <AssignedList
                title="Documents"
                items={assignedDocuments}
                hrefFor={(id) => `/dashboard/clients/${params.clientId}/assigned/documents/${id}`}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AssignForm({
  label,
  emptyLabel,
  fieldName,
  options,
  action,
}: {
  label: string;
  emptyLabel: string;
  fieldName: string;
  options: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  if (options.length === 0) {
    return (
      <div>
        <h3 className="mb-2 text-xs font-medium text-ink-secondary">{label}</h3>
        <p className="text-xs text-ink-muted">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-ink-secondary">{label}</h3>
      <select
        name={fieldName}
        required
        className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="w-fit rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
      >
        Assign
      </button>
    </form>
  );
}

function AssignedList({
  title,
  items,
  hrefFor,
}: {
  title: string;
  items: AssignedRow[];
  hrefFor: (id: string) => string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-ink-secondary">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-ink-muted">Nothing assigned yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={hrefFor(item.id)}
                className="block truncate rounded-md bg-[color:var(--page-plane)] px-2 py-1.5 text-xs text-ink-primary hover:bg-[color:var(--border-hairline)]"
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
