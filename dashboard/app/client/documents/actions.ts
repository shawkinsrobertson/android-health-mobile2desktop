"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { hasFile, uploadMedia } from "@/lib/media";
import { isFileAnswer, type FormAnswers, type FormSchema } from "@/lib/forms";

export async function submitDocumentResponse(assignedDocumentId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") redirect("/login");

  const path = `/client/documents/${assignedDocumentId}`;
  const supabase = await createClient();

  const { data: doc, error: docError } = await supabase
    .from("assigned_documents")
    .select("id, coach_id, document_type, form_schema")
    .eq("id", assignedDocumentId)
    .eq("client_id", profile.id)
    .single();

  if (docError || !doc || doc.document_type !== "form") {
    redirect(`${path}?error=${encodeURIComponent("This document can't be filled out.")}`);
  }

  const { data: existingResponse } = await supabase
    .from("document_responses")
    .select("answers")
    .eq("assigned_document_id", assignedDocumentId)
    .maybeSingle();
  const existingAnswers = (existingResponse?.answers ?? {}) as FormAnswers;

  const schema = (doc.form_schema ?? []) as FormSchema;
  const answers: FormAnswers = {};

  try {
    for (const field of schema) {
      const fieldName = `field_${field.id}`;

      if (field.type === "file_upload") {
        const fileValue = formData.get(`${fieldName}_file`);
        if (hasFile(fileValue)) {
          const uploadedPath = await uploadMedia(
            supabase,
            doc.coach_id,
            "responses",
            fileValue,
            assignedDocumentId,
          );
          answers[field.id] = { path: uploadedPath, filename: fileValue.name };
        } else if (isFileAnswer(existingAnswers[field.id])) {
          // No new file chosen -- keep whatever was already submitted.
          answers[field.id] = existingAnswers[field.id];
        } else if (field.required) {
          throw new Error(`"${field.label}" is required.`);
        } else {
          answers[field.id] = null;
        }
        continue;
      }

      if (field.type === "checkbox") {
        answers[field.id] = formData.get(fieldName) === "on";
        continue;
      }

      const raw = formData.get(fieldName);
      const value = typeof raw === "string" ? raw.trim() : "";

      if (!value) {
        if (field.required) throw new Error(`"${field.label}" is required.`);
        answers[field.id] = field.type === "number" ? null : "";
        continue;
      }

      answers[field.id] = field.type === "number" ? Number(value) : value;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't submit this form.";
    redirect(`${path}?error=${encodeURIComponent(message)}`);
  }

  const { error } = await supabase.from("document_responses").upsert(
    {
      assigned_document_id: assignedDocumentId,
      client_id: profile.id,
      coach_id: doc.coach_id,
      answers,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "assigned_document_id" },
  );

  if (error) {
    redirect(`${path}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(path);
}
