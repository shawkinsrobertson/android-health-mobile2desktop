"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { applyMediaField, readMediaField } from "@/lib/media";
import type { FormSchema } from "@/lib/forms";

const LIST_PATH = "/dashboard/library/documents";

async function requireCoach() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "coach") redirect("/login");
  return profile;
}

function strOrNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function parseFormSchema(raw: FormDataEntryValue | null): FormSchema {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Add at least one field to the form.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Malformed form schema.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Add at least one field to the form.");
  }
  for (const raw of parsed as unknown[]) {
    const field = raw as { id?: unknown; type?: unknown; label?: unknown } | null;
    if (
      !field ||
      typeof field !== "object" ||
      !field.id ||
      !field.type ||
      typeof field.label !== "string" ||
      !field.label.trim()
    ) {
      throw new Error("Every field needs a label.");
    }
  }
  return parsed as FormSchema;
}

export async function createDocument(formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent("Name is required.")}`);
  }
  const description = strOrNull(formData.get("description"));
  const documentType = String(formData.get("document_type") ?? "file");
  if (documentType !== "file" && documentType !== "form") {
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent("Invalid document type.")}`);
  }

  const supabase = await createClient();

  let newId: string;
  try {
    let file_path: string | null = null;
    let file_url: string | null = null;
    let form_schema: FormSchema | null = null;

    if (documentType === "file") {
      const file = await applyMediaField(
        supabase,
        coach.id,
        "documents",
        readMediaField(formData, "file"),
        null,
      );
      file_path = file.path;
      file_url = file.url;
    } else {
      form_schema = parseFormSchema(formData.get("form_schema"));
    }

    const { data, error } = await supabase
      .from("library_documents")
      .insert({
        coach_id: coach.id,
        name,
        description,
        document_type: documentType,
        file_path,
        file_url,
        form_schema,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Failed to create document");
    newId = data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create document";
    redirect(`${LIST_PATH}/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}/${newId}`);
}

export async function updateDocument(documentId: string, formData: FormData) {
  const coach = await requireCoach();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`${LIST_PATH}/${documentId}?error=${encodeURIComponent("Name is required.")}`);
  }
  const description = strOrNull(formData.get("description"));

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("library_documents")
    .select("document_type, file_path")
    .eq("id", documentId)
    .eq("coach_id", coach.id)
    .single();

  if (!existing) redirect(LIST_PATH);

  try {
    const update: Record<string, unknown> = {
      name,
      description,
      updated_at: new Date().toISOString(),
    };

    // A document's type is fixed at creation (file vs. form data shapes
    // aren't interchangeable) -- only the fields for its own type change.
    if (existing.document_type === "file") {
      const file = await applyMediaField(
        supabase,
        coach.id,
        "documents",
        readMediaField(formData, "file"),
        existing.file_path,
      );
      update.file_path = file.path;
      update.file_url = file.url;
    } else {
      update.form_schema = parseFormSchema(formData.get("form_schema"));
    }

    const { error } = await supabase
      .from("library_documents")
      .update(update)
      .eq("id", documentId)
      .eq("coach_id", coach.id);

    if (error) throw new Error(error.message);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save document";
    redirect(`${LIST_PATH}/${documentId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${documentId}`);
}

export async function deleteDocument(documentId: string) {
  const coach = await requireCoach();
  const supabase = await createClient();

  const { error } = await supabase
    .from("library_documents")
    .delete()
    .eq("id", documentId)
    .eq("coach_id", coach.id);

  if (error) {
    redirect(`${LIST_PATH}/${documentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
