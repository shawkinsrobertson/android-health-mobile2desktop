import type { SupabaseClient } from "@supabase/supabase-js";

// Generic "coach reviews before execution" staging for AI assistant write
// outcomes that have no existing list to stage inside of -- see
// supabase/migrations/0028_ai_assistant_proposals.sql for which outcomes
// use this vs. a status column on their own table (draft workouts/
// documents). A write-capable assistant tool only ever calls
// createProposal; it never performs the real side effect itself. Applying
// a proposal (the real side effect + markProposalApplied) is each
// outcome's own responsibility -- this file doesn't know how to send a
// message, change a program, or book a call.

export type ProposalType = "draft_message" | "program_change" | "schedule_call";

export interface Proposal<TPayload = unknown> {
  id: string;
  clientId: string;
  type: ProposalType;
  summary: string;
  payload: TPayload;
  status: "pending" | "rejected" | "applied";
  createdAt: string;
}

function mapRow(row: {
  id: string;
  client_id: string;
  type: string;
  summary: string;
  payload: unknown;
  status: string;
  created_at: string;
}): Proposal {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type as ProposalType,
    summary: row.summary,
    payload: row.payload,
    status: row.status as Proposal["status"],
    createdAt: row.created_at,
  };
}

export async function listPendingProposals(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from("ai_assistant_proposals")
    .select("id, client_id, type, summary, payload, status, created_at")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load pending proposals: ${error.message}`);
  return (data ?? []).map(mapRow);
}

export async function getProposal(
  supabase: SupabaseClient,
  coachId: string,
  proposalId: string,
): Promise<Proposal | null> {
  const { data, error } = await supabase
    .from("ai_assistant_proposals")
    .select("id, client_id, type, summary, payload, status, created_at")
    .eq("coach_id", coachId)
    .eq("id", proposalId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

// Called from a tool's run() function -- never from the review/approve UI.
export async function createProposal(
  supabase: SupabaseClient,
  params: { coachId: string; clientId: string; type: ProposalType; summary: string; payload: unknown },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("ai_assistant_proposals")
    .insert({
      coach_id: params.coachId,
      client_id: params.clientId,
      type: params.type,
      summary: params.summary,
      payload: params.payload as object,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create proposal");
  return { id: data.id };
}

// Discarding a proposal is the same for every type -- no side effect to
// undo, since nothing was ever applied. Applying one is type-specific and
// lives with each outcome (e.g. lib/chat.ts's applyDraftMessageProposal).
export async function rejectProposal(supabase: SupabaseClient, coachId: string, proposalId: string): Promise<void> {
  const { error } = await supabase
    .from("ai_assistant_proposals")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("coach_id", coachId)
    .eq("status", "pending");

  if (error) throw new Error(`Failed to discard proposal: ${error.message}`);
}

// Called by a type-specific apply action immediately after it performs
// the real side effect (sends the message, applies the program change,
// books the call) -- never on its own.
export async function markProposalApplied(supabase: SupabaseClient, coachId: string, proposalId: string): Promise<void> {
  const { error } = await supabase
    .from("ai_assistant_proposals")
    .update({ status: "applied", reviewed_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("coach_id", coachId)
    .eq("status", "pending");

  if (error) throw new Error(`Failed to mark proposal applied: ${error.message}`);
}
