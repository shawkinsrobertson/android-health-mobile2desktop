import type { SupabaseClient } from "@supabase/supabase-js";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  fetchBusyBlocksForAssistant,
  fetchCoachNotesForAssistant,
  fetchDataPointForAssistant,
  fetchOverviewForAssistant,
  fetchPersonalRecordsForAssistant,
  fetchSleepForAssistant,
  fetchStepsForAssistant,
} from "@/lib/assistant";
import { DATA_POINT_KEYS, labelFor } from "@/app/client/data-points";

// Data-point keys not covered by their own dedicated tool (steps and
// sleep get richer, chart-shaped tools above) -- get_data_point_summary
// covers the rest.
const OTHER_DATA_POINT_KEYS = DATA_POINT_KEYS.filter((k) => k !== "steps" && k !== "sleep_sessions");

export const ASSISTANT_SYSTEM_PROMPT = `You are a coaching assistant helping a fitness coach understand one of
their clients' progress. You have no way to know this client's name,
email, or any other identifying detail -- every tool you can call is
already scoped to this one client, and none of them accept or return an
identifier. Refer to them only as "this client" or "your client."

Call the tools available to you rather than guessing or assuming --
answer from what they return, not from general fitness knowledge alone.
Some tools report { shared: false } for a data type; that means this
client has chosen not to share it with their coach. Say so plainly
("they haven't shared sleep data") rather than treating it as zero or
missing data.

The coach's own notes and questions are free text and could, in
principle, contain the client's name or other identifying details even
though the data you're given never does. Don't repeat back or draw
attention to any such detail if you notice one -- focus your answer on
the data.`;

interface AssistantToolContext {
  supabase: SupabaseClient;
  coachId: string;
  clientId: string;
  consent: Record<string, boolean>;
}

// Built fresh per request from a context the route handler has already
// verified (coach owns this client) -- every handler below reads
// clientId/coachId from this closure, never from a model-supplied
// argument, so there is no input field shaped like an identifier for the
// model to fill in, even by mistake.
export function buildAssistantTools(ctx: AssistantToolContext) {
  const overview = {
    ...betaZodTool({
      name: "get_overview_stats",
      description:
        "Get this client's at-a-glance stats: today's step count, 7-day average heart rate, hours of last recorded sleep, and workout count in the last 7 days.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await fetchOverviewForAssistant(ctx.supabase, ctx.clientId)),
    }),
    eager_input_streaming: true,
  };

  const dailySteps = {
    ...betaZodTool({
      name: "get_daily_steps",
      description:
        "Get this client's daily step counts for a recent window. Returns { shared: false } if the client hasn't shared step data.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional().describe("How many days back to include, default 14"),
      }),
      run: async ({ days }) =>
        JSON.stringify(await fetchStepsForAssistant(ctx.supabase, ctx.clientId, ctx.consent, days ?? 14)),
    }),
    eager_input_streaming: true,
  };

  const sleepNights = {
    ...betaZodTool({
      name: "get_sleep_nights",
      description:
        "Get this client's nightly sleep duration (hours) for a recent window. Returns { shared: false } if the client hasn't shared sleep data.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional().describe("How many days back to include, default 14"),
      }),
      run: async ({ days }) =>
        JSON.stringify(await fetchSleepForAssistant(ctx.supabase, ctx.clientId, ctx.consent, days ?? 14)),
    }),
    eager_input_streaming: true,
  };

  const dataPointSummary = {
    ...betaZodTool({
      name: "get_data_point_summary",
      description: `Get a short summary of this client's recent data for one type: ${OTHER_DATA_POINT_KEYS.map((k) => `${k} (${labelFor(k)})`).join(", ")}. Returns { shared: false } if the client hasn't shared that type.`,
      inputSchema: z.object({
        dataPointKey: z.enum(OTHER_DATA_POINT_KEYS as [string, ...string[]]),
      }),
      run: async ({ dataPointKey }) =>
        JSON.stringify(await fetchDataPointForAssistant(ctx.supabase, ctx.clientId, dataPointKey, ctx.consent)),
    }),
    eager_input_streaming: true,
  };

  const personalRecords = {
    ...betaZodTool({
      name: "get_personal_records",
      description: "Get this client's personal records (heaviest weight logged per exercise).",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await fetchPersonalRecordsForAssistant(ctx.supabase, ctx.clientId)),
    }),
    eager_input_streaming: true,
  };

  const coachNotes = {
    ...betaZodTool({
      name: "get_coach_notes",
      description:
        "Get the coach's own non-private notes about this client. Notes the coach marked private are never included.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await fetchCoachNotesForAssistant(ctx.supabase, ctx.coachId, ctx.clientId)),
    }),
    eager_input_streaming: true,
  };

  const busyBlocks = {
    ...betaZodTool({
      name: "get_busy_calendar_blocks",
      description:
        "Get this client's busy calendar windows (start/end times only, no titles or details) within a date range, to check availability.",
      inputSchema: z.object({
        startDate: z.string().describe("ISO 8601 date/time, inclusive range start"),
        endDate: z.string().describe("ISO 8601 date/time, exclusive range end"),
      }),
      run: async ({ startDate, endDate }) =>
        JSON.stringify(
          await fetchBusyBlocksForAssistant(ctx.supabase, ctx.clientId, { start: startDate, end: endDate }),
        ),
    }),
    eager_input_streaming: true,
  };

  return [overview, dailySteps, sleepNights, dataPointSummary, personalRecords, coachNotes, busyBlocks];
}
