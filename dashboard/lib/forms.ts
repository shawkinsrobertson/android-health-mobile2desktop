// Shared types for the document library's dynamic form builder
// (components/library/FormBuilder.tsx) and renderer
// (components/library/DynamicFormRenderer.tsx). A form's schema is stored
// as `library_documents.form_schema` / `assigned_documents.form_schema`
// jsonb -- see supabase/migrations/0004_libraries.sql.

export type FormFieldType =
  | "text"
  | "number"
  | "dropdown"
  | "checkbox"
  | "multiple_choice"
  | "file_upload";

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "file_upload", label: "File upload" },
];

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  // dropdown / multiple_choice only
  options?: string[];
}

export type FormSchema = FormField[];

export function optionsRequired(type: FormFieldType): boolean {
  return type === "dropdown" || type === "multiple_choice";
}

// A file_upload answer records what was stored, not the file itself --
// the file lives in Storage at `path` (see lib/media.ts).
export interface FileAnswer {
  path: string;
  filename: string;
}

export type FormAnswers = Record<string, string | number | boolean | string[] | FileAnswer | null>;

export function isFileAnswer(value: unknown): value is FileAnswer {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    "filename" in value
  );
}

// Parses a FormBuilder's hidden-input value (JSON.stringify(FormField[]))
// back into a FormSchema, throwing a user-facing message on anything
// malformed. Shared by every "coach authors a form_schema" action
// (document library, check-in templates).
export function parseFormSchema(raw: FormDataEntryValue | null): FormSchema {
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
