"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getProposal, markProposalApplied, rejectProposal } from "@/lib/proposals";
import { getOrCreateThread } from "@/lib/chat";
import { sendChatMessage } from "@/lib/chat-actions";

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
  return profile;
}

// Discard is generic across every proposal type -- nothing was ever
// applied, so there's nothing type-specific to undo. Approving a
// proposal is NOT here: each outcome (draft messages, program changes,
// scheduling) owns its own apply action, since applying means actually
// performing the real side effect before calling markProposalApplied.
export async function discardProposal(clientId: string, proposalId: string): Promise<void> {
  const coach = await requireCoach();
  const supabase = await createClient();

  await rejectProposal(supabase, coach.id, proposalId);

  revalidatePath(`/dashboard/clients/${clientId}`);
}

// `body` is whatever the coach left in the editable draft -- may be
// unchanged from the AI's suggestion or fully rewritten. Both versions
// end up on the same proposal row (the original in payload.body, this
// one in payload.sentBody via markProposalApplied's patch) once this
// sends.
export async function approveDraftMessageProposal(clientId: string, proposalId: string, body: string): Promise<void> {
  const coach = await requireCoach();
  const supabase = await createClient();

  const proposal = await getProposal(supabase, coach.id, proposalId);
  if (!proposal || proposal.type !== "draft_message" || proposal.status !== "pending" || proposal.clientId !== clientId) {
    throw new Error("This draft is no longer pending.");
  }

  const finalBody = body.trim();
  if (!finalBody) throw new Error("Message can't be empty.");

  const thread = await getOrCreateThread(supabase, coach.id, clientId);
  const formData = new FormData();
  formData.set("body", finalBody);
  await sendChatMessage(thread.id, formData);

  await markProposalApplied(supabase, coach.id, proposalId, { sentBody: finalBody });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/chat`);
  revalidatePath(`/dashboard/inbox/${clientId}`);
}
