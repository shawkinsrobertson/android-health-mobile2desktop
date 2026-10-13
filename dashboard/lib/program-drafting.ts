import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkoutDraftTools } from "@/lib/workout-drafting";

// Draft programs from a text prompt (Stage 8, following up on outcome
// #4 -- the coach asked for a multi-workout running program, which Stage
// 4's single-workout drafting couldn't produce). Same draft/review/
// publish pattern as workouts/documents: writes directly into
// library_programs/library_program_workouts with status='draft'
// (migration 0031), not into ai_assistant_proposals, and a draft program
// is excluded from every assignment picker until the coach publishes it
// (see the page.tsx files that list library_programs for assignment).
//
// A program is built out of workouts, so this reuses
// buildWorkoutDraftTools from lib/workout-drafting.ts rather than
// duplicating its exercise-matching logic -- the model can draft new
// workouts to fill the program, reuse existing ones via
// get_library_workouts, or mix both, then call propose_program once to
// assemble them in order.

const PROGRAM_DRAFT_SYSTEM_PROMPT = `You are drafting a multi-workout training program for a fitness coach's
library, from their text description.

First call get_library_workouts and get_library_exercises to see what
already exists. Reuse an existing published workout (by id, via
get_library_workouts) wherever the coach's description doesn't need
anything different from it. Only draft a new workout (propose_workout,
after checking get_library_exercises for exercises to reuse) for a
distinct day/session type the library doesn't already cover.

A program is a set of workouts placed on specific days, optionally
across specific weeks. For a plain weekly-repeating pattern (e.g. "3
days a week"), give each workout a dayOfWeek (1=Monday..7=Sunday) and
leave weekNumber unset -- it's understood to repeat every week. Only set
weekNumber when the coach actually describes progression that differs
week to week (e.g. a 6-week program where week 4 adds a session week 1
didn't have).

Once every workout the program needs exists (new or reused), call
propose_program exactly once with the complete list, in the order they
should appear.

This creates a draft only -- nothing is visible to any client and it
can't be assigned to one until the coach reviews and publishes it, so
use your best judgment on set/rep/rest prescriptions and day placement
rather than asking a clarifying question back.`;

function buildProgramDraftTools(
  supabase: SupabaseClient,
  coachId: string,
  onCreated?: (programId: string) => void,
) {
  const workoutTools = buildWorkoutDraftTools(supabase, coachId);

  const getLibraryWorkouts = {
    ...betaZodTool({
      name: "get_library_workouts",
      description:
        "List this coach's existing workouts (id, name, status) to reuse one in the program instead of drafting a new one when it already fits.",
      inputSchema: z.object({}),
      run: async () => {
        const { data } = await supabase
          .from("library_workouts")
          .select("id, name, status")
          .eq("coach_id", coachId)
          .order("name");
        return JSON.stringify(data ?? []);
      },
    }),
    eager_input_streaming: true,
  };

  const proposeProgram = {
    ...betaZodTool({
      name: "propose_program",
      description:
        "Create the drafted program and link its workouts in order. Call exactly once, after every workout it needs has been created (propose_workout) or selected (get_library_workouts).",
      inputSchema: z.object({
        name: z.string().min(1).describe("Program name, e.g. '3-Day Run Program'"),
        description: z.string().optional().describe("One or two sentences describing the program"),
        workouts: z
          .array(
            z.object({
              workoutId: z.string().describe("A workoutId from propose_workout or an id from get_library_workouts"),
              weekNumber: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe("Only set for a multi-week program where this workout differs by week; omit for a plain weekly-repeating pattern"),
              dayOfWeek: z.number().int().min(1).max(7).optional().describe("1=Monday .. 7=Sunday"),
              notes: z.string().optional(),
            }),
          )
          .min(1),
      }),
      run: async ({ name, description, workouts }) => {
        const { data: program, error: programError } = await supabase
          .from("library_programs")
          .insert({ coach_id: coachId, name, description: description ?? null, status: "draft" })
          .select("id")
          .single();
        if (programError || !program) throw new Error(programError?.message ?? "Failed to create draft program");

        for (let i = 0; i < workouts.length; i++) {
          const w = workouts[i];
          await supabase.from("library_program_workouts").insert({
            coach_id: coachId,
            program_id: program.id,
            workout_id: w.workoutId,
            order_index: i,
            week_number: w.weekNumber ?? null,
            day_of_week: w.dayOfWeek ?? null,
            notes: w.notes ?? null,
          });
        }

        onCreated?.(program.id);
        return JSON.stringify({ programId: program.id, workoutCount: workouts.length });
      },
    }),
    eager_input_streaming: true,
  };

  return [...workoutTools, getLibraryWorkouts, proposeProgram];
}

export async function draftProgramFromPrompt(
  supabase: SupabaseClient,
  coachId: string,
  prompt: string,
): Promise<{ programId: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set -- the AI assistant has no model to call.");

  const anthropic = new Anthropic({ apiKey: key });
  let createdProgramId: string | null = null;
  const tools = buildProgramDraftTools(supabase, coachId, (id) => {
    createdProgramId = id;
  });

  await anthropic.beta.messages.toolRunner({
    model: "claude-sonnet-5",
    // Higher than workout-drafting's turn -- a program typically needs
    // several propose_workout calls (each with its own exercise list)
    // plus the final propose_program call, across more turns of the loop.
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: PROGRAM_DRAFT_SYSTEM_PROMPT,
    tools,
    messages: [{ role: "user", content: prompt }],
  });

  if (!createdProgramId) throw new Error("The assistant didn't create a program -- try rephrasing the prompt.");
  return { programId: createdProgramId };
}

export { buildProgramDraftTools };
