"use client";

import { useState } from "react";
import {
  FORM_FIELD_TYPES,
  optionsRequired,
  type FormField,
  type FormFieldType,
  type FormSchema,
} from "@/lib/forms";

function newField(): FormField {
  return { id: crypto.randomUUID(), type: "text", label: "", required: false };
}

// Lets a coach build a document_documents.form_schema (see lib/forms.ts).
// Purely client-side state, serialized into a hidden input so it travels
// along with the surrounding <form action={...}> exactly like any other
// field -- this component never talks to Supabase itself.
export function FormBuilder({
  name,
  initialSchema,
}: {
  name: string;
  initialSchema?: FormSchema;
}) {
  const [fields, setFields] = useState<FormField[]>(
    initialSchema && initialSchema.length > 0 ? initialSchema : [newField()],
  );

  function update(id: string, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function remove(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }

  function move(id: string, direction: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      const swapIdx = idx + direction;
      if (idx < 0 || swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  function updateOptions(id: string, raw: string) {
    const options = raw
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    update(id, { options });
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(fields)} />

      {fields.map((field, idx) => (
        <div
          key={field.id}
          className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-hairline)] p-3"
        >
          <div className="flex items-center gap-2">
            <input
              value={field.label}
              onChange={(e) => update(field.id, { label: e.target.value })}
              placeholder="Question / field label"
              className="flex-1 rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary outline-none"
            />
            <select
              value={field.type}
              onChange={(e) => update(field.id, { type: e.target.value as FormFieldType })}
              className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-xs text-ink-primary"
            >
              {FORM_FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {optionsRequired(field.type) && (
            <textarea
              value={(field.options ?? []).join("\n")}
              onChange={(e) => updateOptions(field.id, e.target.value)}
              rows={3}
              placeholder={"One option per line"}
              className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-xs text-ink-primary outline-none"
            />
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => update(field.id, { required: e.target.checked })}
                className="rounded"
              />
              Required
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => move(field.id, -1)}
                className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={idx === fields.length - 1}
                onClick={() => move(field.id, 1)}
                className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(field.id)}
                disabled={fields.length === 1}
                className="rounded-md border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-ink-secondary hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setFields((prev) => [...prev, newField()])}
        className="w-fit rounded-md border border-dashed border-[color:var(--border-hairline)] px-3 py-1.5 text-xs text-ink-secondary hover:text-ink-primary"
      >
        + Add field
      </button>
    </div>
  );
}
