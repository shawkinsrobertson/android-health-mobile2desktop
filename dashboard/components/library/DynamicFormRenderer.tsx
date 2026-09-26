import { isFileAnswer, type FormAnswers, type FormSchema } from "@/lib/forms";

// Renders a form_schema (see lib/forms.ts) as native inputs inside the
// surrounding <form action={submitDocumentResponse}> -- see
// app/client/documents/actions.ts for how these field names
// (`field_<id>`, `field_<id>_file`) are read back out of the FormData.
// Plain server-rendered markup; the only client-side bit a form like this
// needs (native validation, file picking) the browser already does.
export function DynamicFormRenderer({
  schema,
  existingAnswers,
  existingFileUrls,
  readOnly,
}: {
  schema: FormSchema;
  existingAnswers?: FormAnswers;
  // Resolved signed/external URLs for any file_upload answers already on
  // file, keyed by field id -- see resolveMediaUrl in lib/media.ts.
  existingFileUrls?: Record<string, string | null>;
  readOnly?: boolean;
}) {
  const inputClass =
    "rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none disabled:opacity-60";

  return (
    <div className="flex flex-col gap-5">
      {schema.map((field) => {
        const existing = existingAnswers?.[field.id];
        const fieldName = `field_${field.id}`;

        return (
          <label key={field.id} className="flex flex-col gap-1 text-sm text-ink-primary">
            {field.label}
            {field.required && <span className="text-ink-muted"> *</span>}

            {field.type === "text" && (
              <input
                name={fieldName}
                required={field.required}
                disabled={readOnly}
                defaultValue={typeof existing === "string" ? existing : ""}
                className={inputClass}
              />
            )}

            {field.type === "number" && (
              <input
                type="number"
                name={fieldName}
                required={field.required}
                disabled={readOnly}
                defaultValue={typeof existing === "number" ? existing : ""}
                className={inputClass}
              />
            )}

            {field.type === "dropdown" && (
              <select
                name={fieldName}
                required={field.required}
                disabled={readOnly}
                defaultValue={typeof existing === "string" ? existing : ""}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose one
                </option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {field.type === "checkbox" && (
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name={fieldName}
                  disabled={readOnly}
                  defaultChecked={existing === true}
                  className="rounded"
                />
                <span className="text-xs text-ink-muted">Yes</span>
              </span>
            )}

            {field.type === "multiple_choice" && (
              <span className="flex flex-col gap-1.5">
                {(field.options ?? []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-ink-secondary">
                    <input
                      type="radio"
                      name={fieldName}
                      value={opt}
                      required={field.required}
                      disabled={readOnly}
                      defaultChecked={existing === opt}
                    />
                    {opt}
                  </label>
                ))}
              </span>
            )}

            {field.type === "file_upload" && (
              <span className="flex flex-col gap-1">
                {isFileAnswer(existing) && (
                  <a
                    href={existingFileUrls?.[field.id] ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="w-fit text-xs text-[color:var(--accent)] underline"
                  >
                    Current file: {existing.filename}
                  </a>
                )}
                {!readOnly && (
                  <input
                    type="file"
                    name={`${fieldName}_file`}
                    required={field.required && !isFileAnswer(existing)}
                    className="text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--page-plane)] file:px-3 file:py-1.5 file:text-xs file:text-ink-primary"
                  />
                )}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
