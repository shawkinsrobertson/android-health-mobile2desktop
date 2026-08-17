import { NextResponse } from "next/server";

/**
 * Placeholder endpoint for the AI coach chat (see app/coach). Currently
 * just echoes back a static reply so the chat UI has something to talk to.
 *
 * To wire in a real LLM:
 *   1. `npm install @anthropic-ai/sdk`[x]
 *   2. Add ANTHROPIC_API_KEY to .env.local[x]
 *   3. Pull recent data via lib/queries.ts (steps, heart rate, sleep,
 *      exercise) and fold it into the system prompt/context so the model
 *      can reason about actual training history rather than guessing.
 *   4. Replace the body below with a real model call, streaming the
 *      response back if you want incremental output in the chat UI.
 */
export async function POST(request: Request) {
  const { messages } = await request.json();
  const lastUserMessage = messages?.[messages.length - 1]?.content ?? "";

  return NextResponse.json({
    reply:
      `(placeholder reply) You said: "${lastUserMessage}". Wire a real model into ` +
      "app/api/chat/route.ts to get real coaching responses grounded in your synced data.",
  });
}
