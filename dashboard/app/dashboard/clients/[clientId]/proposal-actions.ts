"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { rejectProposal } from "@/lib/proposals";

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
