"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { getProposal, markProposalApplied, rejectProposal } from "@/lib/proposals";
import { getOrCreateThread } from "@/lib/chat";
import { sendChatMessage } from "@/lib/chat-actions";
import { createEvent } from "@/lib/calendar-actions";

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

interface ExercisePrescription {
  sets: number | null;
  reps: string | null;
  weightNote: string | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

interface ProgramChangeItem {
  action: "update" | "add" | "remove";
  exerciseId?: string;
  exerciseName?: string;
  name?: string;
  before?: ExercisePrescription;
  after?: ExercisePrescription;
  prescription?: ExercisePrescription;
}

interface ProgramChangePayload {
  assignedWorkoutId: string;
  assignedWorkoutName: string;
  changes: ProgramChangeItem[];
}

// Applies every change in the proposal to the real assigned_workout_exercises
// rows -- this is the one place lib/assistant-write-tools.ts's
// propose_program_change tool never touches itself, by design (see
// lib/proposals.ts). Runs the changes sequentially so repeated 'add'
// changes get distinct order_index values without a race.
export async function approveProgramChangeProposal(clientId: string, proposalId: string): Promise<void> {
  const coach = await requireCoach();
  const supabase = await createClient();

  const proposal = await getProposal(supabase, coach.id, proposalId);
  if (!proposal || proposal.type !== "program_change" || proposal.status !== "pending" || proposal.clientId !== clientId) {
    throw new Error("This proposal is no longer pending.");
  }

  const { assignedWorkoutId, changes } = proposal.payload as ProgramChangePayload;
  let nextOrderIndex: number | null = null;

  for (const change of changes) {
    if (change.action === "update" && change.exerciseId && change.after) {
      await supabase
        .from("assigned_workout_exercises")
        .update({
          sets: change.after.sets,
          reps: change.after.reps,
          weight_note: change.after.weightNote,
          rest_seconds: change.after.restSeconds,
          tempo: change.after.tempo,
          notes: change.after.notes,
        })
        .eq("id", change.exerciseId)
        .eq("assigned_workout_id", assignedWorkoutId)
        .eq("coach_id", coach.id);
    } else if (change.action === "remove" && change.exerciseId) {
      await supabase
        .from("assigned_workout_exercises")
        .delete()
        .eq("id", change.exerciseId)
        .eq("assigned_workout_id", assignedWorkoutId)
        .eq("coach_id", coach.id);
    } else if (change.action === "add" && change.name && change.prescription) {
      if (nextOrderIndex === null) {
        const { count } = await supabase
          .from("assigned_workout_exercises")
          .select("id", { count: "exact", head: true })
          .eq("assigned_workout_id", assignedWorkoutId);
        nextOrderIndex = count ?? 0;
      }
      await supabase.from("assigned_workout_exercises").insert({
        client_id: clientId,
        coach_id: coach.id,
        assigned_workout_id: assignedWorkoutId,
        order_index: nextOrderIndex,
        name: change.name,
        sets: change.prescription.sets,
        reps: change.prescription.reps,
        weight_note: change.prescription.weightNote,
        rest_seconds: change.prescription.restSeconds,
        tempo: change.prescription.tempo,
        notes: change.prescription.notes,
      });
      nextOrderIndex += 1;
    }
  }

  await markProposalApplied(supabase, coach.id, proposalId);

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath(`/dashboard/clients/${clientId}/assigned/workouts/${assignedWorkoutId}`);
}

interface ScheduleCallPayload {
  startTime: string;
  endTime: string;
  title: string;
  notes: string | null;
}

// createEvent (lib/calendar-actions.ts) is the one place a calendar_events
// row actually gets created -- it reads the current coach from the
// session itself, same as every other action in this file, so there's
// nothing proposal-specific to duplicate here beyond validating the
// proposal and handing it the staged time/title.
export async function approveScheduleCallProposal(clientId: string, proposalId: string): Promise<void> {
  const coach = await requireCoach();
  const supabase = await createClient();

  const proposal = await getProposal(supabase, coach.id, proposalId);
  if (!proposal || proposal.type !== "schedule_call" || proposal.status !== "pending" || proposal.clientId !== clientId) {
    throw new Error("This proposal is no longer pending.");
  }

  const { startTime, endTime, title, notes } = proposal.payload as ScheduleCallPayload;

  await createEvent({
    title,
    description: notes ?? undefined,
    startTime,
    endTime,
    hasVideoCall: true,
    clientId,
  });

  await markProposalApplied(supabase, coach.id, proposalId);

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
}
