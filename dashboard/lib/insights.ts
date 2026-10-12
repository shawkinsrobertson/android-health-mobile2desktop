import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getConsentMap } from "@/lib/assistant";
import { buildAssistantTools } from "@/lib/assistant-tools";
import { COACHING_GUIDELINES } from "@/lib/coaching-guidelines";

// Proactive counterpart to the on-demand chat in app/api/clients/[clientId]/assistant/route.ts
// -- same privacy-scoped tools, same coaching voice (COACHING_GUIDELINES),
// but a single non-streamed generation instead of a back-and-forth
// conversation, persisted to ai_client_insights (0027) rather than
// ai_assistant_messages.

const INSIGHT_SYSTEM_PROMPT = `You are a coaching assistant generating one short, proactive observation
for a fitness coach about one of their clients. You have no way to know
this client's name, email, or any other identifying detail -- every tool
you can call is already scoped to this one client, and none of them
accept or return an identifier. Refer to them only as "this client" or
"your client."

Call the tools available to you and ground your observation in what they
actually return -- check at least workout adherence, check-in adherence,
and recent data trends before writing anything. If every tool comes back
empty or unshared, say plainly that there isn't enough recent data for
an observation yet, rather than inventing one.

Write exactly one short observation: 2-4 sentences, plain text (no
markdown headers), naming a specific pattern and, where it fits, one
concrete next step the coach could take. This is not a chat reply --
don't greet the coach or ask a follow-up question, just the observation.

${COACHING_GUIDELINES}`;

export interface ClientInsight {
  id: string;
  body: string;
  createdAt: string;
}

export async function getLatestInsight(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<ClientInsight | null> {
  const { data, error } = await supabase
    .from("ai_client_insights")
    .select("id, body, created_at")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, body: data.body, createdAt: data.created_at };
}

export async function generateInsight(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<ClientInsight> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set -- the AI assistant has no model to call.");

  const consent = await getConsentMap(supabase, clientId);
  const tools = buildAssistantTools({ supabase, coachId, clientId, consent });
  const anthropic = new Anthropic({ apiKey: key });

  const finalMessage = await anthropic.beta.messages.toolRunner({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: INSIGHT_SYSTEM_PROMPT,
    tools,
    messages: [
      {
        role: "user",
        content:
          "Review this client's recent data and write one short, specific pattern observation or coaching suggestion.",
      },
    ],
  });

  const body = finalMessage.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!body) throw new Error("The assistant didn't return an observation -- try again.");

  const { data, error } = await supabase
    .from("ai_client_insights")
    .insert({ coach_id: coachId, client_id: clientId, body })
    .select("id, body, created_at")
    .single();

  if (error) throw new Error(`Failed to save insight: ${error.message}`);

  return { id: data.id, body: data.body, createdAt: data.created_at };
}
