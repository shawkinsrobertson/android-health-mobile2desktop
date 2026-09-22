import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailySteps, getDataPointSummary, getOverviewStats, getSleepNights, type DailySteps, type OverviewStats, type SleepNight } from "@/lib/queries";
import { getPersonalRecords, type PersonalRecord } from "@/lib/personal-records";
import { getBusyBlocks, type BusyBlock, type DateRange } from "@/lib/calendar";

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
// exercise_sessions, blood_oxygen, blood_pressure, respiratory_rate) --
// steps and sleep have their own richer fetchers above.
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
