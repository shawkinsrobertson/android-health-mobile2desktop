"use client";

import { useState } from "react";
import { MediaUploadField } from "./MediaUploadField";
import { FormBuilder } from "./FormBuilder";
import { createDocument } from "@/app/dashboard/library/documents/actions";

export function NewDocumentForm() {
  const [documentType, setDocumentType] = useState<"file" | "form">("file");

  return (
    <form action={createDocument} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Name
        <input
          name="name"
          required
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

      <fieldset className="flex gap-4">
        <legend className="mb-1 text-xs font-medium text-ink-secondary">Type</legend>
        <label className="flex items-center gap-2 text-sm text-ink-primary">
          <input
            type="radio"
            name="document_type"
            value="file"
            checked={documentType === "file"}
            onChange={() => setDocumentType("file")}
          />
          File upload
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-primary">
          <input
            type="radio"
            name="document_type"
            value="form"
            checked={documentType === "form"}
            onChange={() => setDocumentType("form")}
          />
          Form (client fills it out)
        </label>
      </fieldset>

      {documentType === "file" ? (
        <MediaUploadField label="File" prefix="file" kind="file" />
      ) : (
        <FormBuilder name="form_schema" />
      )}

      <button
        type="submit"
        className="w-fit rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
      >
        Create document
      </button>
    </form>
  );
}
