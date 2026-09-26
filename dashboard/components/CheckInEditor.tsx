"use client";

import { useState } from "react";
import { FormBuilder } from "@/components/library/FormBuilder";
import { saveCheckInTemplate } from "@/app/dashboard/clients/[clientId]/check-in-actions";
import type { FormSchema } from "@/lib/forms";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface CheckInTemplateSummary {
  name: string;
  schema: FormSchema;
  dayOfWeek: number;
  active: boolean;
}

// Coach-side authoring for the client's one recurring weekly check-in --
// reuses the document library's FormBuilder (see lib/forms.ts) since a
// check-in's questions are exactly a form_schema, just answered weekly
// instead of once.
export function CheckInEditor({
  clientId,
  template,
}: {
  clientId: string;
  template: CheckInTemplateSummary | null;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        {template ? (
          <p className="text-sm text-ink-secondary">
            <span className="text-ink-primary">{template.name}</span> · opens every{" "}
            {DAY_LABELS[template.dayOfWeek]} · {template.schema.length} question
            {template.schema.length === 1 ? "" : "s"} ·{" "}
            {template.active ? "active" : "paused"}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">No weekly check-in set up for this client yet.</p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-fit rounded-md border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
        >
          {template ? "Edit check-in" : "Set up a weekly check-in"}
        </button>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await saveCheckInTemplate(clientId, formData);
        setEditing(false);
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Name
        <input
          name="name"
          defaultValue={template?.name ?? "Weekly Check-In"}
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Opens every
        <select
          name="day_of_week"
          defaultValue={template?.dayOfWeek ?? 0}
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
        >
          {DAY_LABELS.map((label, value) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
        <input type="checkbox" name="active" defaultChecked={template?.active ?? true} />
        Active (shows up in the client&apos;s Tasks each week)
      </label>

      <FormBuilder name="form_schema" initialSchema={template?.schema} />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
        >
          Save check-in
        </button>
      </div>
    </form>
  );
}
