import Anthropic from "@anthropic-ai/sdk";
import type { DailySteps, OverviewStats, SleepNight } from "@/lib/queries";
import { getDailySteps, getOverviewStats, getSleepNights } from "@/lib/queries";

// Streams a Claude response for the coach chat (see app/coach), grounded in
// the user's own synced Health Connect data pulled fresh from Supabase on
// every request. Reads ANTHROPIC_API_KEY from the environment -- see
// .env.local.example.
const anthropic = new Anthropic();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages?: ChatMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const [stats, steps, sleep] = await Promise.all([
    getOverviewStats().catch(() => null),
    getDailySteps(14).catch(() => []),
    getSleepNights(14).catch(() => []),
  ]);

  const claudeStream = anthropic.messages.stream({
    model: "claude-opus-5",
    max_tokens: 8192,
    system: buildSystemPrompt({ stats, steps, sleep }),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      claudeStream.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function buildSystemPrompt(data: {
  stats: OverviewStats | null;
  steps: DailySteps[];
  sleep: SleepNight[];
}): string {
  const { stats, steps, sleep } = data;

  const statsLines = stats
    ? [
        `Steps today: ${stats.stepsToday}`,
        `Average heart rate (7d): ${stats.avgHeartRate7d ?? "no data"} bpm`,
        `Last sleep: ${stats.lastSleepHours ?? "no data"} hours`,
        `Workouts (7d): ${stats.exerciseSessions7d}`,
      ].join("\n")
    : "No summary stats available (Supabase unreachable, or nothing synced yet).";

  const stepsLines = steps.length
    ? steps.map((d) => `${d.date}: ${d.count.toLocaleString()} steps`).join("\n")
    : "No steps data synced yet.";

  const sleepLines = sleep.length
    ? sleep.map((n) => `${n.date}: ${n.hours}h`).join("\n")
    : "No sleep data synced yet.";

  return [
    "You are a supportive, knowledgeable personal training coach chatting with",
    "another personal training coach about a particular client's training data",
    "synced from their Android device. Ground observations and suggestions in",
    "the numbers below -- reference specific figures and trends rather than",
    "speaking in generalities, and say plainly when data looks sparse or",
    "missing rather than guessing past it. Keep replies conversational and to",
    "the point; this is a chat, not a report.",
    "",
    "## Current snapshot",
    statsLines,
    "",
    "## Steps, last 14 days",
    stepsLines,
    "",
    "## Sleep, last 14 days",
    sleepLines,
  ].join("\n");
}
