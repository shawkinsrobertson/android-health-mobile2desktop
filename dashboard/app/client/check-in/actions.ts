"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { hasFile, uploadMedia } from "@/lib/media";
import { isFileAnswer, type FormAnswers, type FormSchema } from "@/lib/forms";
import { currentWeekStart } from "@/lib/check-ins";

const PATH = "/client/check-in";

export async function submitCheckIn(templateId: string, formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "client") redirect("/login");

  const supabase = await createClient();

  const { data: template, error: templateError } = await supabase
    .from("check_in_templates")
    .select("id, coach_id, client_id, form_schema, day_of_week, active")
    .eq("id", templateId)
    .eq("client_id", profile.id)
    .single();

  if (templateError || !template || !template.active) {
    redirect(`${PATH}?error=${encodeURIComponent("This check-in isn't available.")}`);
  }

  const weekStart = currentWeekStart(template.day_of_week);

  const { data: existingResponse } = await supabase
    .from("check_in_responses")
    .select("answers")
    .eq("template_id", templateId)
    .eq("week_start", weekStart)
    .maybeSingle();
  const existingAnswers = (existingResponse?.answers ?? {}) as FormAnswers;

  const schema = (template.form_schema ?? []) as FormSchema;
  const answers: FormAnswers = {};

  try {
    for (const field of schema) {
      const fieldName = `field_${field.id}`;

      if (field.type === "file_upload") {
        const fileValue = formData.get(`${fieldName}_file`);
        if (hasFile(fileValue)) {
          const uploadedPath = await uploadMedia(
            supabase,
            template.coach_id,
            "responses",
            fileValue,
            `checkin-${templateId}-${weekStart}`,
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
    redirect(`${PATH}?error=${encodeURIComponent(message)}`);
  }

  const { error } = await supabase.from("check_in_responses").upsert(
    {
      template_id: templateId,
      client_id: profile.id,
      coach_id: template.coach_id,
      week_start: weekStart,
      answers,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template_id,week_start" },
  );

  if (error) {
    redirect(`${PATH}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(PATH);
  revalidatePath("/client");
}
