import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField, FormFieldType } from "@/lib/forms";

// Draft documents from a text prompt (outcome #5) -- same shape as Stage 4's
// lib/workout-drafting.ts: a small, self-contained, coach-level (not
// client-scoped) tool-calling turn, writing directly into templates
// (type='document') with status='draft' (migration 0033) rather than
// through ai_assistant_proposals. Scoped to form-type documents only --
// see 0030_library_documents_draft_status.sql's original comment for why.

const DOCUMENT_DRAFT_SYSTEM_PROMPT = `You are drafting an intake/check-in form for a fitness coach's document library,
from their text description. Call propose_document_form exactly once
with the complete form.

Field type guidance: "dropdown" or "multiple_choice" for a fixed set of
options (multiple_choice when more than one answer could reasonably be
selected, dropdown otherwise), "number" for a numeric rating or count,
"checkbox" for a plain yes/no, "text" for open-ended answers, and
"file_upload" only when the coach's description implies a photo or
document upload (e.g. a progress photo check-in). Keep labels short and
direct, phrased as a question or prompt the client answers. Mark a field
required only when skipping it would make the response not useful.

This creates a draft only -- nothing is visible to any client and it
can't be assigned to one until the coach reviews and publishes it, so
use your best judgment rather than asking a clarifying question back.`;

function buildDocumentDraftTools(supabase: SupabaseClient, coachId: string, onCreated: (documentId: string) => void) {
  const proposeDocumentForm = {
    ...betaZodTool({
      name: "propose_document_form",
      description: "Create the drafted form document with its fields. Call exactly once.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Document name, e.g. 'Weekly Check-In'"),
        description: z.string().optional().describe("One sentence describing what this form is for"),
        fields: z
          .array(
            z.object({
              type: z.enum(["text", "number", "dropdown", "checkbox", "multiple_choice", "file_upload"]),
              label: z.string().min(1).describe("The question or prompt shown to the client"),
              required: z.boolean(),
              options: z.array(z.string()).optional().describe("Required for dropdown/multiple_choice, omit otherwise"),
            }),
          )
          .min(1),
      }),
      run: async ({ name, description, fields }) => {
        const formSchema: FormField[] = fields.map((f, i) => ({
          id: `field-${Date.now()}-${i}`,
          type: f.type as FormFieldType,
          label: f.label,
          required: f.required,
          ...(f.options && f.options.length > 0 ? { options: f.options } : {}),
        }));

        const { data: document, error } = await supabase
          .from("templates")
          .insert({
            coach_id: coachId,
            type: "document",
            name,
            description: description ?? null,
            document_type: "form",
            form_schema: formSchema,
            status: "draft",
          })
          .select("id")
          .single();
        if (error || !document) throw new Error(error?.message ?? "Failed to create draft document");

        onCreated(document.id as string);
        return JSON.stringify({ documentId: document.id, fieldCount: formSchema.length });
      },
    }),
    eager_input_streaming: true,
  };

  return [proposeDocumentForm];
}

export async function draftDocumentFromPrompt(
  supabase: SupabaseClient,
  coachId: string,
  prompt: string,
): Promise<{ documentId: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set -- the AI assistant has no model to call.");

  const anthropic = new Anthropic({ apiKey: key });
  let createdDocumentId: string | null = null;
  const tools = buildDocumentDraftTools(supabase, coachId, (id) => {
    createdDocumentId = id;
  });

  await anthropic.beta.messages.toolRunner({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: DOCUMENT_DRAFT_SYSTEM_PROMPT,
    tools,
    messages: [{ role: "user", content: prompt }],
  });

  if (!createdDocumentId) throw new Error("The assistant didn't create a document -- try rephrasing the prompt.");
  return { documentId: createdDocumentId };
}
