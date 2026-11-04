"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { hasFile, uploadMedia } from "@/lib/media";
import { isFileAnswer, type FormAnswers, type FormSchema } from "@/lib/forms";

function path(assignmentId: string) {
  return `/client/check-in/${assignmentId}`;
}

export async function submitCheckIn(assignmentId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") redirect("/login");

  const supabase = await createClient();

  const { data: occurrence, error: occurrenceError } = await supabase
    .from("assignments")
    .select("id, coach_id, form_schema")
    .eq("id", assignmentId)
    .eq("client_id", profile.id)
    .eq("type", "check_in")
    .single();

  if (occurrenceError || !occurrence) {
    redirect(`${path(assignmentId)}?error=${encodeURIComponent("This check-in isn't available.")}`);
  }

  const { data: existingResponse } = await supabase
    .from("assignment_responses")
    .select("answers")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  const existingAnswers = (existingResponse?.answers ?? {}) as FormAnswers;

  const schema = (occurrence.form_schema ?? []) as FormSchema;
  const answers: FormAnswers = {};

  try {
    for (const field of schema) {
      const fieldName = `field_${field.id}`;

      if (field.type === "file_upload") {
        const fileValue = formData.get(`${fieldName}_file`);
        if (hasFile(fileValue)) {
          const uploadedPath = await uploadMedia(
            supabase,
            occurrence.coach_id,
            "responses",
            fileValue,
            `checkin-${assignmentId}`,
          );
          answers[field.id] = { path: uploadedPath, filename: fileValue.name };
        } else if (isFileAnswer(existingAnswers[field.id])) {
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
    const message = err instanceof Error ? err.message : "Couldn't submit this check-in.";
    redirect(`${path(assignmentId)}?error=${encodeURIComponent(message)}`);
  }

  const { error } = await supabase.from("assignment_responses").upsert(
    {
      assignment_id: assignmentId,
      client_id: profile.id,
      coach_id: occurrence.coach_id,
      answers,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "assignment_id" },
  );

  if (error) {
    redirect(`${path(assignmentId)}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(path(assignmentId));
  revalidatePath("/client");
}
