import { getCurrentProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { draftProgramFromPrompt } from "@/lib/program-drafting";

// Tool Runner needs Node, not edge -- same as the client-scoped assistant
// routes and the workout-drafting route.
export const runtime = "nodejs";

const MAX_PROMPT_LENGTH = 2000;

export async function POST(request: Request) {
  const coach = await getCurrentProfile();
  if (!coach || coach.role !== "coach") {
    return new Response(JSON.stringify({ error: "Not signed in as a coach" }), { status: 401 });
  }

  let body: { prompt?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Describe the program you want drafted" }), { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return new Response(JSON.stringify({ error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters)` }), {
      status: 400,
    });
  }

  const supabase = await createClient();

  try {
    const { programId } = await draftProgramFromPrompt(supabase, coach.id, prompt);
    return Response.json({ programId });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Couldn't draft a program" }),
      { status: 500 },
    );
  }
}
