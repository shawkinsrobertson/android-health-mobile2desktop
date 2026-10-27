import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// Draft workouts from a text prompt (outcome #4). A drafted workout is
// coach-level library content, not tied to any one client, so this still
// gets its own standalone tool-calling turn below (draftWorkoutFromPrompt,
// used by the Workouts list page's prompt box) rather than being folded
// into buildAssistantTools's client-scoped read loop. buildWorkoutDraftTools
// itself is exported, though, so the per-client assistant's write tools
// (lib/assistant-write-tools.ts) and the program-drafting flow
// (lib/program-drafting.ts) can reuse it directly -- a drafted workout
// still never gets assigned to any client by either path, it's always a
// coach-level draft they review on the real Workouts page.
//
// Per the coach's own decision on how drafts should stage: this writes
// directly into templates/template_components (type='workout') with
// status='draft' (migration 0033), not into ai_assistant_proposals --
// review happens on the real Workouts list/detail pages, not a separate
// queue. "Coach reviews before execution" is enforced by excluding
// status='draft' rows from every assignment picker (see the page.tsx
// files that list templates for assignment), not by this file.

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

// Exported so both the standalone drafting turn below and the per-client
// assistant's write tools (lib/assistant-write-tools.ts) -- directly, and
// via lib/program-drafting.ts's buildProgramDraftTools -- can create a
// draft workout without duplicating the exercise-matching logic.
export function buildWorkoutDraftTools(
  supabase: SupabaseClient,
  coachId: string,
  onCreated?: (workoutId: string) => void,
) {
  const getLibraryExercises = {
    ...betaZodTool({
      name: "get_library_exercises",
      description: "List this coach's existing library exercises (id and name) to match against before creating new ones.",
      inputSchema: z.object({}),
      run: async () => {
        const { data } = await supabase
          .from("templates")
          .select("id, name")
          .eq("type", "exercise")
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
        const { data: existing } = await supabase.from("templates").select("id, name").eq("type", "exercise");
        const byName = new Map(((existing ?? []) as { id: string; name: string }[]).map((e) => [e.name.trim().toLowerCase(), e.id]));

        const { data: workout, error: workoutError } = await supabase
          .from("templates")
          .insert({ coach_id: coachId, type: "workout", name, description: description ?? null, status: "draft" })
          .select("id")
          .single();
        if (workoutError || !workout) throw new Error(workoutError?.message ?? "Failed to create draft workout");

        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          const key = ex.name.trim().toLowerCase();
          let exerciseId = byName.get(key);
          if (!exerciseId) {
            const { data: newExercise, error: exerciseError } = await supabase
              .from("templates")
              .insert({ coach_id: coachId, type: "exercise", name: ex.name.trim() })
              .select("id")
              .single();
            if (exerciseError || !newExercise) throw new Error(exerciseError?.message ?? "Failed to create exercise");
            exerciseId = newExercise.id as string;
            byName.set(key, exerciseId);
          }

          await supabase.from("template_components").insert({
            coach_id: coachId,
            parent_id: workout.id,
            child_id: exerciseId,
            order_index: i,
            sets: ex.sets ?? null,
            reps: ex.reps ?? null,
            rest_seconds: ex.restSeconds ?? null,
            tempo: ex.tempo ?? null,
            notes: ex.notes ?? null,
          });
        }

        onCreated?.(workout.id);
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
