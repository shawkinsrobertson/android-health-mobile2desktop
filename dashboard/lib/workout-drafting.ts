import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// Draft workouts from a text prompt (outcome #4). Unlike the client-scoped
// assistant (lib/assistant-tools.ts), this isn't tied to any one client --
// workouts are coach-level library content -- so it's a separate, smaller
// tool-calling turn rather than reusing buildAssistantTools/buildWriteTools.
//
// Per the coach's own decision on how drafts should stage: this writes
// directly into library_workouts/library_workout_exercises with
// status='draft' (migration 0029), not into ai_assistant_proposals --
// review happens on the real Workouts list/detail pages, not a separate
// queue. "Coach reviews before execution" is enforced by excluding
// status='draft' rows from every assignment picker (see the page.tsx
// files that list library_workouts for assignment), not by this file.

const WORKOUT_DRAFT_SYSTEM_PROMPT = `You are drafting a workout for a fitness coach's library, from their text
description. Call get_library_exercises first and reuse an existing
exercise (matching by name) wherever one reasonably fits, instead of
inventing a duplicate -- only use a new exercise name when nothing in
their library is close. Then call propose_workout exactly once with the
complete workout.

Use standard, sensible set/rep/rest prescriptions for the type of
training described (e.g. strength: 3-5 sets of 3-6 reps, 2-3min rest;
hypertrophy: 3-4 sets of 8-12 reps, 60-90s rest; conditioning: higher
reps or time-based, shorter rest) unless the coach's prompt specifies
otherwise. Order exercises in a sensible sequence -- compound/multi-joint
movements before isolation work, main lifts before accessories.

This creates a draft only -- nothing is visible to any client and it
can't be assigned to one until the coach reviews and publishes it, so
use your best judgment rather than asking a clarifying question back.`;

function buildWorkoutDraftTools(supabase: SupabaseClient, coachId: string, onCreated: (workoutId: string) => void) {
  const getLibraryExercises = {
    ...betaZodTool({
      name: "get_library_exercises",
      description: "List this coach's existing library exercises (id and name) to match against before creating new ones.",
      inputSchema: z.object({}),
      run: async () => {
        const { data } = await supabase
          .from("library_exercises")
          .select("id, name")
          .order("name");
        return JSON.stringify(data ?? []);
      },
    }),
    eager_input_streaming: true,
  };

  const proposeWorkout = {
    ...betaZodTool({
      name: "propose_workout",
      description: "Create the drafted workout with its exercises. Call exactly once, after checking get_library_exercises.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Workout name, e.g. 'Upper Body Hypertrophy'"),
        description: z.string().optional().describe("One or two sentences describing the workout's focus"),
        exercises: z
          .array(
            z.object({
              name: z.string().min(1).describe("Exercise name -- reuse an existing library exercise's exact name when one fits"),
              sets: z.number().int().min(1).optional(),
              reps: z.string().optional().describe("e.g. '8-12', 'AMRAP', '30s'"),
              restSeconds: z.number().int().min(0).optional(),
              tempo: z.string().optional(),
              notes: z.string().optional(),
            }),
          )
          .min(1),
      }),
      run: async ({ name, description, exercises }) => {
        const { data: existing } = await supabase.from("library_exercises").select("id, name");
        const byName = new Map(((existing ?? []) as { id: string; name: string }[]).map((e) => [e.name.trim().toLowerCase(), e.id]));

        const { data: workout, error: workoutError } = await supabase
          .from("library_workouts")
          .insert({ coach_id: coachId, name, description: description ?? null, status: "draft" })
          .select("id")
          .single();
        if (workoutError || !workout) throw new Error(workoutError?.message ?? "Failed to create draft workout");

        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          const key = ex.name.trim().toLowerCase();
          let exerciseId = byName.get(key);
          if (!exerciseId) {
            const { data: newExercise, error: exerciseError } = await supabase
              .from("library_exercises")
              .insert({ coach_id: coachId, name: ex.name.trim() })
              .select("id")
              .single();
            if (exerciseError || !newExercise) throw new Error(exerciseError?.message ?? "Failed to create exercise");
            exerciseId = newExercise.id as string;
            byName.set(key, exerciseId);
          }

          await supabase.from("library_workout_exercises").insert({
            coach_id: coachId,
            workout_id: workout.id,
            exercise_id: exerciseId,
            order_index: i,
            sets: ex.sets ?? null,
            reps: ex.reps ?? null,
            rest_seconds: ex.restSeconds ?? null,
            tempo: ex.tempo ?? null,
            notes: ex.notes ?? null,
          });
        }

        onCreated(workout.id);
        return JSON.stringify({ workoutId: workout.id, exerciseCount: exercises.length });
      },
    }),
    eager_input_streaming: true,
  };

  return [getLibraryExercises, proposeWorkout];
}

export async function draftWorkoutFromPrompt(
  supabase: SupabaseClient,
  coachId: string,
  prompt: string,
): Promise<{ workoutId: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set -- the AI assistant has no model to call.");

  const anthropic = new Anthropic({ apiKey: key });
  let createdWorkoutId: string | null = null;
  const tools = buildWorkoutDraftTools(supabase, coachId, (id) => {
    createdWorkoutId = id;
  });

  await anthropic.beta.messages.toolRunner({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: WORKOUT_DRAFT_SYSTEM_PROMPT,
    tools,
    messages: [{ role: "user", content: prompt }],
  });

  if (!createdWorkoutId) throw new Error("The assistant didn't create a workout -- try rephrasing the prompt.");
  return { workoutId: createdWorkoutId };
}
