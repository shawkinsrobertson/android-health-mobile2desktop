import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createProposal } from "@/lib/proposals";
import type { AssistantToolContext } from "@/lib/assistant-tools";

// Write-capable tools, deliberately kept separate from
// buildAssistantTools()'s read-only set in assistant-tools.ts: the
// proactive insight generator (lib/insights.ts) reuses that read-only
// set directly and must never gain the ability to take actions on its
// own, so these are only added to the interactive chat route's tool
// list. Every tool here creates a pending ai_assistant_proposals row and
// nothing else -- see lib/proposals.ts for why.

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildWriteTools(ctx: AssistantToolContext) {
  const draftMessage = {
    ...betaZodTool({
      name: "draft_message_to_client",
      description:
        "Draft a chat message to send to this client, for the coach to review and send themselves. This does NOT send anything -- it creates a pending draft the coach must approve first. Use this whenever the coach asks you to write or suggest a message, instead of putting the message text in your own reply.",
      inputSchema: z.object({
        body: z
          .string()
          .min(1)
          .describe("The full drafted message, written as if the coach is speaking directly to the client."),
      }),
      run: async ({ body }) => {
        const { id } = await createProposal(ctx.supabase, {
          coachId: ctx.coachId,
          clientId: ctx.clientId,
          type: "draft_message",
          summary: truncate(body, 80),
          payload: { body },
        });
        return JSON.stringify({ proposalId: id, status: "pending_review" });
      },
    }),
    eager_input_streaming: true,
  };

  const proposeProgramChange = {
    ...betaZodTool({
      name: "propose_program_change",
      description:
        "Propose a change to one of this client's assigned workouts (update an exercise's prescription, add a new exercise, or remove one). This does NOT change anything -- it creates a pending proposal the coach must review and apply first. Call get_assigned_workouts and get_assigned_workout_exercises first to find the right ids.",
      inputSchema: z.object({
        assignedWorkoutId: z.string().describe("An id from get_assigned_workouts"),
        summary: z.string().min(1).describe("One sentence summarizing the change, for the coach to scan"),
        changes: z
          .array(
            z.discriminatedUnion("action", [
              z.object({
                action: z.literal("update"),
                exerciseId: z.string().describe("An id from get_assigned_workout_exercises"),
                sets: z.number().int().min(1).optional(),
                reps: z.string().optional(),
                weightNote: z.string().optional(),
                restSeconds: z.number().int().min(0).optional(),
                tempo: z.string().optional(),
                notes: z.string().optional(),
              }),
              z.object({
                action: z.literal("add"),
                name: z.string().min(1),
                sets: z.number().int().min(1).optional(),
                reps: z.string().optional(),
                weightNote: z.string().optional(),
                restSeconds: z.number().int().min(0).optional(),
                tempo: z.string().optional(),
                notes: z.string().optional(),
              }),
              z.object({
                action: z.literal("remove"),
                exerciseId: z.string().describe("An id from get_assigned_workout_exercises"),
              }),
            ]),
          )
          .min(1),
      }),
      run: async ({ assignedWorkoutId, summary, changes }) => {
        const { data: workout } = await ctx.supabase
          .from("assigned_workouts")
          .select("name")
          .eq("id", assignedWorkoutId)
          .eq("client_id", ctx.clientId)
          .single();
        if (!workout) throw new Error("Assigned workout not found");

        const enrichedChanges = await Promise.all(
          changes.map(async (change) => {
            if (change.action === "add") {
              return {
                action: "add" as const,
                name: change.name,
                prescription: {
                  sets: change.sets ?? null,
                  reps: change.reps ?? null,
                  weightNote: change.weightNote ?? null,
                  restSeconds: change.restSeconds ?? null,
                  tempo: change.tempo ?? null,
                  notes: change.notes ?? null,
                },
              };
            }

            const { data: existing } = await ctx.supabase
              .from("assigned_workout_exercises")
              .select("name, sets, reps, weight_note, rest_seconds, tempo, notes")
              .eq("id", change.exerciseId)
              .eq("assigned_workout_id", assignedWorkoutId)
              .single();
            if (!existing) throw new Error(`Exercise ${change.exerciseId} not found in this workout`);

            const before = {
              sets: existing.sets,
              reps: existing.reps,
              weightNote: existing.weight_note,
              restSeconds: existing.rest_seconds,
              tempo: existing.tempo,
              notes: existing.notes,
            };

            if (change.action === "remove") {
              return { action: "remove" as const, exerciseId: change.exerciseId, exerciseName: existing.name, prescription: before };
            }

            return {
              action: "update" as const,
              exerciseId: change.exerciseId,
              exerciseName: existing.name,
              before,
              after: {
                sets: change.sets ?? before.sets,
                reps: change.reps ?? before.reps,
                weightNote: change.weightNote ?? before.weightNote,
                restSeconds: change.restSeconds ?? before.restSeconds,
                tempo: change.tempo ?? before.tempo,
                notes: change.notes ?? before.notes,
              },
            };
          }),
        );

        const { id } = await createProposal(ctx.supabase, {
          coachId: ctx.coachId,
          clientId: ctx.clientId,
          type: "program_change",
          summary,
          payload: { assignedWorkoutId, assignedWorkoutName: workout.name, changes: enrichedChanges },
        });
        return JSON.stringify({ proposalId: id, status: "pending_review" });
      },
    }),
    eager_input_streaming: true,
  };

  return [draftMessage, proposeProgramChange];
}
