"use client";

import { FormBuilder } from "./FormBuilder";
import { createCheckIn } from "@/app/dashboard/library/check-ins/actions";

export function NewCheckInForm() {
  return (
    <form action={createCheckIn} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Name
        <input
          name="name"
          required
          defaultValue="Weekly Check-In"
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Description <span className="text-ink-muted">(optional)</span>
        <textarea
          name="description"
          rows={3}
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
        />
      </label>

      <FormBuilder name="form_schema" />

      <button
        type="submit"
        className="w-fit rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white"
      >
        Create check-in
      </button>
    </form>
  );
}
