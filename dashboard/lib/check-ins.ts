import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormAnswers, FormSchema } from "./forms";

export interface CheckInTemplate {
  id: string;
  coachId: string;
  clientId: string;
  name: string;
  schema: FormSchema;
  dayOfWeek: number;
  active: boolean;
}

export interface CheckInResponse {
  id: string;
  templateId: string;
  weekStart: string;
  answers: FormAnswers;
  submittedAt: string | null;
}

// Sunday=0 .. Saturday=6, matching check_in_templates.day_of_week and
// JS's own Date#getUTCDay(). Computed in UTC (not the caller's or a
// user's local time zone) -- for a weekly cadence a client near a
// timezone boundary could see "this week" flip a few hours off from
// their coach's wall clock around the template's day_of_week, which is
// an accepted simplification here (unlike the steps/sleep bucketing bug
// fixed earlier in this project, a day's slop on a *weekly* check-in
// doesn't misrepresent the data, just which day it's dated).
export function currentWeekStart(dayOfWeek: number, reference: Date = new Date()): string {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const diff = (d.getUTCDay() - dayOfWeek + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export async function getCheckInTemplate(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<CheckInTemplate | null> {
  const { data, error } = await supabase
    .from("check_in_templates")
    .select("id, coach_id, client_id, name, form_schema, day_of_week, active")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    coachId: data.coach_id,
    clientId: data.client_id,
    name: data.name,
    schema: (data.form_schema ?? []) as FormSchema,
    dayOfWeek: data.day_of_week,
    active: data.active,
  };
}

// This week's check-in for a client: the active template (if any) plus
// whatever response row already exists for the current week (if the
// client has already started/finished answering it). Used by both the
// client's own check-in page and the home screen's Tasks panel -- a
// non-null template with a null/unsubmitted response is what makes a
// check-in "due."
export async function getCurrentCheckIn(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ template: CheckInTemplate | null; response: CheckInResponse | null }> {
  const { data: templateRow } = await supabase
    .from("check_in_templates")
    .select("id, coach_id, client_id, name, form_schema, day_of_week, active")
    .eq("client_id", clientId)
    .eq("active", true)
    .maybeSingle();

  if (!templateRow) return { template: null, response: null };

  const template: CheckInTemplate = {
    id: templateRow.id,
    coachId: templateRow.coach_id,
    clientId: templateRow.client_id,
    name: templateRow.name,
    schema: (templateRow.form_schema ?? []) as FormSchema,
    dayOfWeek: templateRow.day_of_week,
    active: templateRow.active,
  };

  const weekStart = currentWeekStart(template.dayOfWeek);
  const { data: responseRow } = await supabase
    .from("check_in_responses")
    .select("id, template_id, week_start, answers, submitted_at")
    .eq("template_id", template.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  const response: CheckInResponse | null = responseRow
    ? {
        id: responseRow.id,
        templateId: responseRow.template_id,
        weekStart: responseRow.week_start,
        answers: (responseRow.answers ?? {}) as FormAnswers,
        submittedAt: responseRow.submitted_at,
      }
    : null;

  return { template, response };
}

export interface CheckInHistoryRow {
  id: string;
  weekStart: string;
  answers: FormAnswers;
  submittedAt: string | null;
}

export async function getCheckInHistory(
  supabase: SupabaseClient,
  templateId: string,
  limit = 12,
): Promise<CheckInHistoryRow[]> {
  const { data, error } = await supabase
    .from("check_in_responses")
    .select("id, week_start, answers, submitted_at")
    .eq("template_id", templateId)
    .not("submitted_at", "is", null)
    .order("week_start", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    weekStart: row.week_start,
    answers: (row.answers ?? {}) as FormAnswers,
    submittedAt: row.submitted_at,
  }));
}
