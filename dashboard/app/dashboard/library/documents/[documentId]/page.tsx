import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { FormBuilder } from "@/components/library/FormBuilder";
import type { FormSchema } from "@/lib/forms";
import { updateDocument, deleteDocument } from "../actions";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: { documentId: string };
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data: document, error } = await supabase
    .from("library_documents")
    .select("id, name, description, document_type, file_path, file_url, form_schema")
    .eq("id", params.documentId)
    .eq("coach_id", profile.id)
    .single();

  if (error || !document) redirect("/dashboard/library/documents");

  const fileUrl =
    document.document_type === "file"
      ? await resolveMediaUrl(supabase, document.file_path, document.file_url)
      : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/library/documents"
            className="text-sm text-ink-secondary hover:text-ink-primary"
          >
            ← Documents
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">{document.name}</h1>
        </div>
        <form action={deleteDocument.bind(null, document.id)}>
          <button
            type="submit"
            className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs text-ink-secondary hover:text-red-600 dark:hover:text-red-400"
          >
            Delete
          </button>
        </form>
      </div>

      <form action={updateDocument.bind(null, document.id)} className="flex flex-col gap-4">
        {searchParams.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Name
          <input
            name="name"
            required
            defaultValue={document.name}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Description <span className="text-ink-muted">(optional)</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={document.description ?? ""}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        {document.document_type === "file" ? (
          <MediaUploadField
            label="File"
            prefix="file"
            kind="file"
            previewUrl={fileUrl}
            urlValue={document.file_url}
            hasStoredFile={!!document.file_path}
          />
        ) : (
          <FormBuilder name="form_schema" initialSchema={(document.form_schema ?? []) as FormSchema} />
        )}

        <button
          type="submit"
          className="w-fit rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
