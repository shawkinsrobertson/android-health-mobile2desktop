import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createProposal } from "@/lib/proposals";
import type { AssistantToolContext } from "@/lib/assistant-tools";

// Write-capable tools, deliberately kept separate from
// buildAssistantTools()'s read-only set in assistant-tools.ts: the
// proactive insight generator (lib/insights.ts) reuses that read-only
// set directly and must never gain the ability to take actions on its
// own, so these are only added to the interactive chat route's tool
// list. Every tool here creates a pending ai_assistant_proposals row and
// nothing else -- see lib/proposals.ts for why.

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

  return [draftMessage];
}
