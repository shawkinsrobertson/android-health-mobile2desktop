import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createProposal } from "@/lib/proposals";
import { buildProgramDraftTools } from "@/lib/program-drafting";
import type { AssistantToolContext } from "@/lib/assistant-tools";

// Write-capable tools, deliberately kept separate from
// buildAssistantTools()'s read-only set in assistant-tools.ts: the
// proactive insight generator (lib/insights.ts) reuses that read-only
// set directly and must never gain the ability to take actions on its
// own, so these are only added to the interactive chat route's tool
// list.
//
// Most tools here create a pending ai_assistant_proposals row and
// nothing else -- see lib/proposals.ts for why. The workout/program
// drafting tools pulled in below are the exception: they follow the
// Stage 4/5/8 convention instead, writing a real status='draft' row
// directly into templates (reviewed on the real Workouts/Programs
// pages, not a proposal queue) -- but the one thing
// both patterns share is the same guarantee this file exists to
// enforce: nothing here ever assigns anything to a client, and nothing
// becomes visible to one without an explicit, separate coach action.

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
          .from("assignments")
          .select("name")
          .eq("id", assignedWorkoutId)
          .eq("client_id", ctx.clientId)
          .eq("type", "workout")
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
              .from("assignment_components")
              .select("name, sets, reps, weight_note, rest_seconds, tempo, notes")
              .eq("id", change.exerciseId)
              .eq("assignment_id", assignedWorkoutId)
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

  const proposeScheduleCall = {
    ...betaZodTool({
      name: "propose_schedule_call",
      description:
        "Propose a specific time for a coaching call with this client. This does NOT book anything -- it creates a pending proposal the coach must review and approve first. Call get_busy_calendar_blocks first to check the client isn't already busy at the proposed time.",
      inputSchema: z.object({
        startTime: z.string().describe("ISO 8601 date/time for the proposed call's start"),
        endTime: z.string().describe("ISO 8601 date/time for the proposed call's end"),
        title: z.string().optional().describe("Short event title, defaults to 'Coaching call'"),
        notes: z.string().optional().describe("Optional agenda or notes for the call"),
        summary: z.string().min(1).describe("One sentence summarizing the proposed time, for the coach to scan"),
      }),
      run: async ({ startTime, endTime, title, notes, summary }) => {
        if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
          throw new Error("endTime must be after startTime");
        }

        const { id } = await createProposal(ctx.supabase, {
          coachId: ctx.coachId,
          clientId: ctx.clientId,
          type: "schedule_call",
          summary,
          payload: { startTime, endTime, title: title?.trim() || "Coaching call", notes: notes ?? null },
        });
        return JSON.stringify({ proposalId: id, status: "pending_review" });
      },
    }),
    eager_input_streaming: true,
  };

  // Superset of buildWorkoutDraftTools -- includes get_library_exercises
  // and propose_workout alongside get_library_workouts/propose_program,
  // so the coach can ask this chat to draft either a single workout or a
  // full multi-workout program and the model picks the right depth. Not
  // tied to ctx.clientId at all: a drafted workout/program is coach-level
  // library content the coach reviews and assigns themselves afterward,
  // same as drafting one from the Workouts/Programs list pages directly.
  const draftingTools = buildProgramDraftTools(ctx.supabase, ctx.coachId);

  return [draftMessage, proposeProgramChange, proposeScheduleCall, ...draftingTools];
}
