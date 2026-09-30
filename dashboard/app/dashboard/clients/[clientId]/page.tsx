import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { getDailySeries, getDataPointSummary, unitFor } from "@/lib/queries";
import { getThreadReadOnly, isThreadUnread } from "@/lib/chat";
import { getPersonalRecords } from "@/lib/personal-records";
import { listEvents } from "@/lib/calendar";
import { rangeForView } from "@/lib/calendar-grid";
import { DATA_POINTS, labelFor } from "@/app/client/data-points";
import { PersonalRecordsList } from "@/components/PersonalRecordsList";
import { CalendarCard } from "@/components/calendar/CalendarCard";
import { DataOverlayChart, type OverlaySeries } from "@/components/DataOverlayChart";
import { assignWorkoutToClient, assignProgramToClient, assignDocumentToClient } from "./assign-actions";
import { CoachNotes } from "@/components/CoachNotes";
import type { CoachNoteRow } from "./notes-actions";
import { ClientAssistantSidebar } from "@/components/ClientAssistantSidebar";
import { getAssistantMessages } from "@/lib/assistant";
import { CheckInEditor } from "@/components/CheckInEditor";
import { getCheckInTemplate } from "@/lib/check-ins";

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
    redirect("/dashboard/clients");
  }

  const client = profileRes.data;
  const thread = await getThreadReadOnly(supabase, coach.id, params.clientId);
  const chatUnread = thread ? isThreadUnread(thread, "coach") : false;
  const checkInTemplate = await getCheckInTemplate(supabase, coach.id, params.clientId);

  const [summaries, seriesByKey] = clientProfile.onboardedAt
    ? await Promise.all([
        Promise.all(
          clientProfile.topDataPoints.map(async (key) => ({
            key,
            summary: await getDataPointSummary(supabase, key, params.clientId).catch(
              () => "Couldn't load this right now",
            ),
          })),
        ),
        Promise.all(
          DATA_POINTS.map(async (d) => ({
            key: d.key,
            points: await getDailySeries(supabase, d.key, 14, params.clientId).catch(() => []),
          })),
        ),
      ])
    : [[], []];

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

  const seriesMap = new Map(seriesByKey.map((s) => [s.key, s.points]));
  const overlaySeries: OverlaySeries[] = DATA_POINTS.filter((d) => consentByType[d.key] !== false).map(
    (d) => ({
      key: d.key,
      label: d.label,
      unit: unitFor(d.key),
      points: seriesMap.get(d.key) ?? [],
    }),
  );

  return (
    <div className="flex items-start gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <div>
          <Link href="/dashboard/clients" className="text-sm text-ink-secondary hover:text-ink-primary">
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
            {searchParams.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
            )}

            {/* Data dashboard: client's chosen tiles + one overlay graph for every shared data type. */}
            <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink-primary">
                Featured data points (client&apos;s picks)
              </h2>
              {summaries.length === 0 ? (
                <p className="mb-4 text-sm text-ink-muted">
                  They haven&apos;t picked any data points to feature yet.
                </p>
              ) : (
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
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

              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Shared data, last 14 days
              </h3>
              <DataOverlayChart series={overlaySeries} />
            </section>

            <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink-primary">Personal records</h2>
                {personalRecords.length > 3 && (
                  <Link
                    href={`/dashboard/clients/${params.clientId}/personal-records`}
                    className="text-xs text-[color:var(--accent)] hover:underline"
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

            <div className="flex flex-wrap gap-[10%]">
              <section className="w-full rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 sm:w-[45%]">
                <h2 className="mb-1 text-sm font-semibold text-ink-primary">Weekly check-in</h2>
                <p className="mb-3 text-xs text-ink-muted">
                  A recurring set of questions this client answers each week -- shows up in their Tasks.
                </p>
                <CheckInEditor
                  clientId={params.clientId}
                  template={
                    checkInTemplate
                      ? {
                          name: checkInTemplate.name,
                          schema: checkInTemplate.schema,
                          dayOfWeek: checkInTemplate.dayOfWeek,
                          active: checkInTemplate.active,
                        }
                      : null
                  }
                />
              </section>

              <section className="w-full rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 sm:w-[45%]">
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
            </div>

            <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink-primary">Assigned content</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <AssignedCategory
                  title="Workouts"
                  items={assignedWorkouts}
                  hrefFor={(id) => `/dashboard/clients/${params.clientId}/assigned/workouts/${id}`}
                  assignLabel="Workout"
                  emptyAssignLabel="No workouts in your library yet."
                  fieldName="workout_id"
                  options={libraryWorkouts}
                  action={assignWorkoutToClient.bind(null, params.clientId)}
                />
                <AssignedCategory
                  title="Programs"
                  items={assignedPrograms}
                  hrefFor={(id) => `/dashboard/clients/${params.clientId}/assigned/programs/${id}`}
                  assignLabel="Program"
                  emptyAssignLabel="No programs in your library yet."
                  fieldName="program_id"
                  options={libraryPrograms}
                  action={assignProgramToClient.bind(null, params.clientId)}
                />
                <AssignedCategory
                  title="Documents"
                  items={assignedDocuments}
                  hrefFor={(id) => `/dashboard/clients/${params.clientId}/assigned/documents/${id}`}
                  assignLabel="Document"
                  emptyAssignLabel="No documents in your library yet."
                  fieldName="document_id"
                  options={libraryDocuments}
                  action={assignDocumentToClient.bind(null, params.clientId)}
                />
              </div>
            </section>

            <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink-primary">About</h2>
              <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Phone</dt>
                  <dd className="text-ink-primary">{clientProfile.phone || "—"}</dd>
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

              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Data types shared
              </h3>
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
                          consented ? "bg-[color:var(--accent)]" : "bg-ink-muted"
                        }`}
                        aria-hidden="true"
                      />
                      <span className={consented ? "" : "text-ink-muted"}>{d.label}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <CalendarCard
              scope={{ clientId: params.clientId }}
              initialEvents={calendarEvents}
              fixedClientId={params.clientId}
              title="Shared calendar"
              googleSync={{ targetProfileId: params.clientId }}
              creatorHasGoogleConnection={!!coachGoogleConnectionRes.data}
            />
          </>
        )}
      </div>

      {clientProfile.onboardedAt && (
        <ClientAssistantSidebar
          clientId={params.clientId}
          initialMessages={assistantMessages.map((m) => ({ role: m.role, content: m.content }))}
        />
      )}
    </div>
  );
}

function AssignedCategory({
  title,
  items,
  hrefFor,
  assignLabel,
  emptyAssignLabel,
  fieldName,
  options,
  action,
}: {
  title: string;
  items: AssignedRow[];
  hrefFor: (id: string) => string;
  assignLabel: string;
  emptyAssignLabel: string;
  fieldName: string;
  options: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-ink-secondary">{title}</h3>
      {items.length === 0 ? (
        <p className="mb-2 text-xs text-ink-muted">Nothing assigned yet.</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1.5">
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

      {options.length === 0 ? (
        <p className="text-xs text-ink-muted">{emptyAssignLabel}</p>
      ) : (
        <form action={action} className="flex flex-col gap-1.5 border-t border-[color:var(--border-hairline)] pt-2">
          <label className="text-[11px] font-medium text-ink-muted">+ Assign {assignLabel.toLowerCase()}</label>
          <div className="flex gap-1.5">
            <select
              name={fieldName}
              required
              className="min-w-0 flex-1 rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-xs text-ink-primary"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[color:var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white"
            >
              Assign
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
