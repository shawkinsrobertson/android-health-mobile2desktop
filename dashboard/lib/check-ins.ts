import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormAnswers, FormSchema } from "./forms";

// A client's recurring check-in is one "source" assignment row
// (type='check_in', recurrence_days_of_week set -- see
// 0045_check_ins_assignments.sql), the same recurrence mechanism a
// recurring workout already uses. Each week's actual occurrence is its
// own separate assignment row: the source row doubles as its own first
// occurrence, and generate_recurring_occurrences lazily materializes
// every week after that, tagged recurrence_source_id back at the source.

export interface CheckInSeries {
  sourceId: string;
  coachId: string;
  clientId: string;
  name: string;
  schema: FormSchema;
  recurrenceDaysOfWeek: number[]; // isodow, 1=Monday..7=Sunday
  recurrenceEndDate: string | null;
}

export function isSeriesActive(series: Pick<CheckInSeries, "recurrenceEndDate">, today = new Date()): boolean {
  if (!series.recurrenceEndDate) return true;
  return series.recurrenceEndDate >= today.toISOString().slice(0, 10);
}

// The client's current recurring check-in series, if any. The old
// check_in_templates.unique(coach_id, client_id) made "exactly one" a
// structural guarantee; nothing forces that here, so this picks the most
// recently created source row rather than assuming it's the only one.
export async function getActiveCheckInSeries(
  supabase: SupabaseClient,
  clientId: string,
): Promise<CheckInSeries | null> {
  const { data } = await supabase
    .from("assignments")
    .select("id, coach_id, client_id, name, form_schema, recurrence_days_of_week, recurrence_end_date")
    .eq("client_id", clientId)
    .eq("type", "check_in")
    .not("recurrence_days_of_week", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    sourceId: data.id,
    coachId: data.coach_id,
    clientId: data.client_id,
    name: data.name,
    schema: (data.form_schema ?? []) as FormSchema,
    recurrenceDaysOfWeek: data.recurrence_days_of_week ?? [],
    recurrenceEndDate: data.recurrence_end_date,
  };
}

// Ensures this week's occurrence row actually exists (a no-op once the
// series has ended -- see isSeriesActive -- or if generate_recurring_
// occurrences already ran recently, since that RPC is itself idempotent)
// and returns the most recently *due* occurrence's id: the one with the
// latest scheduled_date that isn't in the future, so a client who hasn't
// opened the app in a day or two still lands on the week actually due,
// not a blank one dated tomorrow.
export async function ensureCurrentCheckInOccurrence(
  supabase: SupabaseClient,
  series: CheckInSeries,
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);

  if (isSeriesActive(series)) {
    const through = new Date();
    through.setUTCDate(through.getUTCDate() + 7);
    await supabase.rpc("generate_recurring_occurrences", {
      p_assignment_id: series.sourceId,
      p_through: through.toISOString().slice(0, 10),
    });
  }

  const { data } = await supabase
    .from("assignments")
    .select("id")
    .eq("client_id", series.clientId)
    .eq("type", "check_in")
    .or(`id.eq.${series.sourceId},recurrence_source_id.eq.${series.sourceId}`)
    .lte("scheduled_date", today)
    .order("scheduled_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

export interface CheckInOccurrence {
  id: string;
  seriesSourceId: string;
  scheduledDate: string;
  name: string;
  schema: FormSchema;
}

export async function getCheckInOccurrence(
  supabase: SupabaseClient,
  assignmentId: string,
  clientId: string,
): Promise<CheckInOccurrence | null> {
  const { data } = await supabase
    .from("assignments")
    .select("id, name, form_schema, recurrence_source_id, scheduled_date")
    .eq("id", assignmentId)
    .eq("client_id", clientId)
    .eq("type", "check_in")
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    seriesSourceId: data.recurrence_source_id ?? data.id,
    scheduledDate: data.scheduled_date,
    name: data.name,
    schema: (data.form_schema ?? []) as FormSchema,
  };
}

export interface CheckInResponse {
  answers: FormAnswers;
  submittedAt: string | null;
}

export async function getCheckInResponse(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<CheckInResponse | null> {
  const { data } = await supabase
    .from("assignment_responses")
    .select("answers, submitted_at")
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (!data) return null;
  return { answers: (data.answers ?? {}) as FormAnswers, submittedAt: data.submitted_at };
}

export interface CheckInHistoryRow {
  id: string;
  scheduledDate: string;
  answers: FormAnswers;
  submittedAt: string | null;
}

// Every real occurrence (the source row + every generated child) in a
// series, newest first -- the coach-side response viewer's history list,
// and the assistant adherence check below, both build on this. Two
// queries then merged client-side, same shape listScheduledAssignments
// in lib/calendar-items.ts already uses, rather than relying on a
// PostgREST embed's exact one-vs-many inference.
export async function listCheckInOccurrencesForSeries(
  supabase: SupabaseClient,
  seriesSourceId: string,
  limit = 52,
): Promise<CheckInHistoryRow[]> {
  const { data: occurrences } = await supabase
    .from("assignments")
    .select("id, scheduled_date")
    .eq("type", "check_in")
    .or(`id.eq.${seriesSourceId},recurrence_source_id.eq.${seriesSourceId}`)
    .order("scheduled_date", { ascending: false })
    .limit(limit);

  const rows = occurrences ?? [];
  if (rows.length === 0) return [];

  const { data: responses } = await supabase
    .from("assignment_responses")
    .select("assignment_id, answers, submitted_at")
    .in("assignment_id", rows.map((r) => r.id));

  const responseById = new Map((responses ?? []).map((r) => [r.assignment_id, r]));

  return rows.map((row) => {
    const response = responseById.get(row.id);
    return {
      id: row.id,
      scheduledDate: row.scheduled_date,
      answers: (response?.answers ?? {}) as FormAnswers,
      submittedAt: response?.submitted_at ?? null,
    };
  });
}
