import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailySteps, getDataPointSummary, getOverviewStats, getSleepNights, type DailySteps, type OverviewStats, type SleepNight } from "@/lib/queries";
import { getPersonalRecords, type PersonalRecord } from "@/lib/personal-records";
import { getBusyBlocks, type BusyBlock, type DateRange } from "@/lib/calendar";
import { currentWeekStart, type CheckInTemplate } from "@/lib/check-ins";

// Every function in this file is the one place in the codebase where every
// byte the AI assistant model can ever see must be traceable back to a
// query. Nothing here may accept or return a client-identifying value
// (name, email, phone, sync code) -- only numbers, dates, and exercise
// names scoped to a clientId the caller already established server-side.

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export async function getAssistantMessages(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  limit = 40,
): Promise<AssistantMessage[]> {
  const { data, error } = await supabase
    .from("ai_assistant_messages")
    .select("role, content, created_at")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load assistant messages: ${error.message}`);

  return ((data ?? []) as { role: "user" | "assistant"; content: string; created_at: string }[])
    .reverse()
    .map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at }));
}

export async function appendAssistantMessage(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from("ai_assistant_messages")
    .insert({ coach_id: coachId, client_id: clientId, role, content });

  if (error) throw new Error(`Failed to save assistant message: ${error.message}`);
}

// client_data_consent, keyed by data_type -- a missing row means the
// client never touched the default, which is opt-in (see
// 0014_client_data_consent.sql's `consented boolean not null default
// true`). Reuses the exact `consented !== false` rule the client detail
// page already applies in its own consentByType, rather than reinventing
// it here.
export async function getConsentMap(
  supabase: SupabaseClient,
  clientId: string,
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from("client_data_consent")
    .select("data_type, consented")
    .eq("client_id", clientId);

  if (error) throw new Error(`Failed to load data consent: ${error.message}`);

  return Object.fromEntries(
    ((data ?? []) as { data_type: string; consented: boolean }[]).map((r) => [r.data_type, r.consented]),
  );
}

function isConsented(consent: Record<string, boolean>, dataType: string): boolean {
  return consent[dataType] !== false;
}

export type ConsentGated<T> = { shared: true; data: T } | { shared: false };

export async function fetchOverviewForAssistant(
  supabase: SupabaseClient,
  clientId: string,
): Promise<OverviewStats> {
  return getOverviewStats(supabase, clientId);
}

export async function fetchStepsForAssistant(
  supabase: SupabaseClient,
  clientId: string,
  consent: Record<string, boolean>,
  days = 14,
): Promise<ConsentGated<DailySteps[]>> {
  if (!isConsented(consent, "steps")) return { shared: false };
  return { shared: true, data: await getDailySteps(supabase, days, clientId) };
}

export async function fetchSleepForAssistant(
  supabase: SupabaseClient,
  clientId: string,
  consent: Record<string, boolean>,
  days = 14,
): Promise<ConsentGated<SleepNight[]>> {
  if (!isConsented(consent, "sleep_sessions")) return { shared: false };
  return { shared: true, data: await getSleepNights(supabase, days, clientId) };
}

// Covers the remaining data-point types (heart_rate_samples,
// exercise_sessions, blood_oxygen, blood_pressure, respiratory_rate,
// blood_glucose) -- steps and sleep have their own richer fetchers above.
export async function fetchDataPointForAssistant(
  supabase: SupabaseClient,
  clientId: string,
  dataPointKey: string,
  consent: Record<string, boolean>,
): Promise<ConsentGated<string>> {
  if (!isConsented(consent, dataPointKey)) return { shared: false };
  return { shared: true, data: await getDataPointSummary(supabase, dataPointKey, clientId) };
}

export async function fetchPersonalRecordsForAssistant(
  supabase: SupabaseClient,
  clientId: string,
): Promise<PersonalRecord[]> {
  return getPersonalRecords(supabase, clientId);
}

export interface AssistantCoachNote {
  body: string;
  createdAt: string;
}

// First real enforcement of coach_notes.is_private -- the UI has promised
// "excluded from the AI assistant's context" since the note editor
// shipped (0013_coach_notes.sql), but nothing queried on it until now.
export async function fetchCoachNotesForAssistant(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<AssistantCoachNote[]> {
  const { data, error } = await supabase
    .from("coach_notes")
    .select("body, created_at")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Failed to load coach notes: ${error.message}`);

  return ((data ?? []) as { body: string; created_at: string }[]).map((row) => ({
    body: row.body,
    createdAt: row.created_at,
  }));
}

export async function fetchBusyBlocksForAssistant(
  supabase: SupabaseClient,
  clientId: string,
  range: DateRange,
): Promise<BusyBlock[]> {
  return getBusyBlocks(supabase, clientId, range);
}

export interface CheckInAdherence {
  hasActiveTemplate: boolean;
  // Most recent week first. true = submitted that week, false = due but
  // not submitted. Consistency (not magnitude) is what the coaching
  // guidelines ask the assistant to weigh here -- see lib/coaching-guidelines.ts.
  recentWeeks: { weekStart: string; submitted: boolean }[];
}

// Reuses check_in_templates/responses (lib/check-ins.ts) but, unlike
// getCheckInHistory, deliberately includes the *missed* weeks -- the
// pattern the assistant needs is submitted-vs-due, not just a list of
// what was submitted.
export async function fetchCheckInAdherenceForAssistant(
  supabase: SupabaseClient,
  clientId: string,
  weeks = 8,
): Promise<CheckInAdherence> {
  const { data: templateRow } = await supabase
    .from("check_in_templates")
    .select("id, day_of_week")
    .eq("client_id", clientId)
    .eq("active", true)
    .maybeSingle();

  if (!templateRow) return { hasActiveTemplate: false, recentWeeks: [] };

  const template = templateRow as Pick<CheckInTemplate, "id"> & { day_of_week: number };
  const expectedWeeks: string[] = [];
  const latest = new Date(currentWeekStart(template.day_of_week));
  for (let i = 0; i < weeks; i++) {
    const d = new Date(latest);
    d.setUTCDate(d.getUTCDate() - i * 7);
    expectedWeeks.push(d.toISOString().slice(0, 10));
  }

  const { data: responseRows } = await supabase
    .from("check_in_responses")
    .select("week_start, submitted_at")
    .eq("template_id", template.id)
    .in("week_start", expectedWeeks);

  const submittedWeeks = new Set(
    ((responseRows ?? []) as { week_start: string; submitted_at: string | null }[])
      .filter((r) => r.submitted_at)
      .map((r) => r.week_start),
  );

  return {
    hasActiveTemplate: true,
    recentWeeks: expectedWeeks.map((weekStart) => ({ weekStart, submitted: submittedWeeks.has(weekStart) })),
  };
}

export interface WorkoutAdherence {
  // Last `days` of scheduling: every session this client started, whether
  // it was finished, and whether it actually got assigned-workout-level
  // completion data. Lets the assistant distinguish "trained less" from
  // "started sessions but didn't finish them" -- a different pattern.
  startedCount: number;
  completedCount: number;
  sessions: { performedOn: string; completed: boolean }[];
}

export async function fetchWorkoutAdherenceForAssistant(
  supabase: SupabaseClient,
  clientId: string,
  days = 28,
): Promise<WorkoutAdherence> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("performed_on, completed_at")
    .eq("client_id", clientId)
    .gte("performed_on", since.toISOString().slice(0, 10))
    .order("performed_on", { ascending: false });

  if (error) throw new Error(`Failed to load workout adherence: ${error.message}`);

  const rows = (data ?? []) as { performed_on: string; completed_at: string | null }[];
  const sessions = rows.map((r) => ({ performedOn: r.performed_on, completed: !!r.completed_at }));

  return {
    startedCount: sessions.length,
    completedCount: sessions.filter((s) => s.completed).length,
    sessions,
  };
}

export interface AssignedWorkoutSummary {
  id: string;
  name: string;
  assignedAt: string;
}

// For program-change proposals (outcome #2) -- the assistant needs to see
// what's currently assigned before it can propose a change to it. Reads
// only, same as everything else in this file; lib/assistant-write-tools.ts
// is where a proposed change actually gets staged.
export async function fetchAssignedWorkoutsForAssistant(
  supabase: SupabaseClient,
  clientId: string,
): Promise<AssignedWorkoutSummary[]> {
  const { data, error } = await supabase
    .from("assigned_workouts")
    .select("id, name, assigned_at")
    .eq("client_id", clientId)
    .order("assigned_at", { ascending: false });

  if (error) throw new Error(`Failed to load assigned workouts: ${error.message}`);
  return ((data ?? []) as { id: string; name: string; assigned_at: string }[]).map((row) => ({
    id: row.id,
    name: row.name,
    assignedAt: row.assigned_at,
  }));
}

export interface AssignedExerciseSummary {
  id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  weightNote: string | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

export async function fetchAssignedWorkoutExercisesForAssistant(
  supabase: SupabaseClient,
  clientId: string,
  assignedWorkoutId: string,
): Promise<AssignedExerciseSummary[]> {
  const { data, error } = await supabase
    .from("assigned_workout_exercises")
    .select("id, name, sets, reps, weight_note, rest_seconds, tempo, notes")
    .eq("client_id", clientId)
    .eq("assigned_workout_id", assignedWorkoutId)
    .order("order_index");

  if (error) throw new Error(`Failed to load assigned workout exercises: ${error.message}`);
  return (
    (data ?? []) as {
      id: string;
      name: string;
      sets: number | null;
      reps: string | null;
      weight_note: string | null;
      rest_seconds: number | null;
      tempo: string | null;
      notes: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    sets: row.sets,
    reps: row.reps,
    weightNote: row.weight_note,
    restSeconds: row.rest_seconds,
    tempo: row.tempo,
    notes: row.notes,
  }));
}
