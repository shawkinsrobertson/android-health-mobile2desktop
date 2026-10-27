import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { FormBuilder } from "@/components/library/FormBuilder";
import { AssignToClientCard } from "@/components/library/AssignToClientCard";
import { PublishDeleteActions } from "@/components/library/PublishDeleteActions";
import type { FormSchema } from "@/lib/forms";
import { updateDocument, deleteDocument, publishDocument } from "../actions";
import { assignLibraryDocumentToClient } from "../../assign-actions";

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
  const [{ data: document, error }, { data: clientRows }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, description, document_type, file_path, file_url, form_schema, status")
      .eq("id", params.documentId)
      .eq("type", "document")
      .eq("coach_id", profile.id)
      .single(),
    supabase
      .from("client_profiles")
      .select("profile_id, profiles!client_profiles_profile_id_fkey(full_name, email)")
      .eq("coach_id", profile.id),
  ]);

  if (error || !document) redirect("/dashboard/library/documents");

  const fileUrl =
    document.document_type === "file"
      ? await resolveMediaUrl(supabase, document.file_path, document.file_url)
      : null;

  const clients = (
    (clientRows ?? []) as unknown as {
      profile_id: string;
      profiles: { full_name: string | null; email: string } | null;
    }[]
  ).map((c) => ({ id: c.profile_id, name: c.profiles?.full_name || c.profiles?.email || "Unnamed client" }));

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
          <div className="mt-1 flex items-center gap-1.5">
            <h1 className="text-lg font-semibold text-ink-primary">{document.name}</h1>
            {document.status === "draft" && (
              <span className="rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[color:var(--accent)]">
                Draft
              </span>
            )}
          </div>
        </div>
        <PublishDeleteActions
          id={document.id}
          itemLabel="document"
          isDraft={document.status === "draft"}
          onPublish={publishDocument}
          onDelete={deleteDocument}
        />
      </div>

      <form action={updateDocument.bind(null, document.id)} className="flex flex-col gap-4">
        {searchParams.error && (
          <p className="text-sm text-danger">{searchParams.error}</p>
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

      {document.status === "draft" ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          Publish this document before assigning it to a client.
        </p>
      ) : (
        <AssignToClientCard
          itemId={document.id}
          action={assignLibraryDocumentToClient}
          clients={clients}
          itemLabel="document"
        />
      )}
    </div>
  );
}
