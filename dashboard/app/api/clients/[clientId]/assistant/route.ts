import Anthropic from "@anthropic-ai/sdk";
import { getCurrentProfile, getClientProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { appendAssistantMessage, getAssistantMessages, getConsentMap } from "@/lib/assistant";
import { ASSISTANT_SYSTEM_PROMPT, buildAssistantTools } from "@/lib/assistant-tools";

// Not named api/chat -- that path used to bypass middleware.ts's auth
// gate for a since-deleted feature (see PLANNING.md's Phase 5 section).
// Tool Runner needs Node, not edge.
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4000;

class TruncatedToolInput extends Error {}

function anthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set -- the AI assistant has no model to call.");
  return new Anthropic({ apiKey: key });
}

function ndjson(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  const coach = await getCurrentProfile();
  if (!coach || coach.role !== "coach") {
    return new Response(JSON.stringify({ error: "Not signed in as a coach" }), { status: 401 });
  }

  const supabase = await createClient();
  const clientProfile = await getClientProfile(params.clientId, supabase);
  if (!clientProfile || clientProfile.coachId !== coach.id) {
    return new Response(JSON.stringify({ error: "Not your client" }), { status: 403 });
  }

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required" }), { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return new Response(JSON.stringify({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` }), {
      status: 400,
    });
  }

  let anthropic: Anthropic;
  try {
    anthropic = anthropicClient();
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Assistant unavailable" }), {
      status: 500,
    });
  }

  // Persisted before the model call, so the coach's own message is never
  // lost even if the model call itself fails.
  await appendAssistantMessage(supabase, coach.id, params.clientId, "user", message);

  const [history, consent] = await Promise.all([
    getAssistantMessages(supabase, coach.id, params.clientId),
    getConsentMap(supabase, params.clientId),
  ]);

  const tools = buildAssistantTools({ supabase, coachId: coach.id, clientId: params.clientId, consent });

  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      try {
        let runner = anthropic.beta.messages.toolRunner({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          system: ASSISTANT_SYSTEM_PROMPT,
          tools,
          messages,
          stream: true,
        });

        for (let attempt = 0; ; attempt++) {
          try {
            for await (const messageStream of runner) {
              for await (const event of messageStream) {
                if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
                  controller.enqueue(ndjson({ type: "tool_use", name: event.content_block.name }));
                } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                  fullText += event.delta.text;
                  controller.enqueue(ndjson({ type: "text", text: event.delta.text }));
                }
              }

              const finalMessage = await messageStream.finalMessage();
              attempt = 0;

              const hasToolUse = finalMessage.content.some((b) => b.type === "tool_use");
              if (finalMessage.stop_reason === "max_tokens" && hasToolUse) {
                throw new TruncatedToolInput("tool input truncated; retry with a higher max_tokens");
              }
              if (finalMessage.stop_reason === "refusal") break;
              if (finalMessage.stop_reason === "pause_turn") {
                runner.pushMessages({ role: "assistant", content: finalMessage.content });
              }
            }
            break;
          } catch (err) {
            if (err instanceof Anthropic.APIError || err instanceof TruncatedToolInput || attempt >= 2) {
              throw err;
            }
            runner = anthropic.beta.messages.toolRunner({ ...runner.params });
          }
        }

        if (fullText.trim()) {
          await appendAssistantMessage(supabase, coach.id, params.clientId, "assistant", fullText.trim());
        }
        controller.enqueue(ndjson({ type: "done" }));
      } catch (err) {
        controller.enqueue(
          ndjson({ type: "error", message: err instanceof Error ? err.message : "The assistant hit an error" }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
