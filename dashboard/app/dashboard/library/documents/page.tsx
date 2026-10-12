import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { DraftDocumentPrompt } from "@/components/library/DraftDocumentPrompt";

export const dynamic = "force-dynamic";

interface DocumentRow {
  id: string;
  name: string;
  description: string | null;
  document_type: "file" | "form";
  status: "draft" | "published";
}

function DocumentList({ documents }: { documents: DocumentRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((doc) => (
        <li key={doc.id}>
          <Link
            href={`/dashboard/library/documents/${doc.id}`}
            className="flex items-center justify-between rounded-xl border border-[color:var(--border-hairline)] bg-surface p-3 hover:bg-[color:var(--page-plane)]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-ink-primary">{doc.name}</span>
                {doc.status === "draft" && (
                  <span className="shrink-0 rounded-full bg-[color:var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--accent)]">
                    Draft
                  </span>
                )}
              </div>
              {doc.description && (
                <div className="truncate text-xs text-ink-muted">{doc.description}</div>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                doc.document_type === "form"
                  ? "bg-[color:var(--series-exercise)]/20 text-[color:var(--series-exercise)]"
                  : "bg-[color:var(--accent)]/20 text-[color:var(--accent)]"
              }`}
            >
              {doc.document_type === "form" ? "form" : "file"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DocumentLibraryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_documents")
    .select("id, name, description, document_type, status")
    .order("name");

  const all = (data ?? []) as DocumentRow[];
  const drafts = all.filter((d) => d.status === "draft");
  const published = all.filter((d) => d.status === "published");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/library" className="text-sm text-ink-secondary hover:text-ink-primary">
            ← Library
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-ink-primary">Documents</h1>
        </div>
        <Link
          href="/dashboard/library/documents/new"
          className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
        >
          New document
        </Link>
      </div>

      <DraftDocumentPrompt />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load documents: {error.message}
        </p>
      ) : all.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          No documents yet -- upload a file or build a form.
        </p>
      ) : (
        <>
          {drafts.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink-primary">Drafts</h2>
              <DocumentList documents={drafts} />
            </div>
          )}
          {published.length > 0 && (
            <div className="flex flex-col gap-3">
              {drafts.length > 0 && <h2 className="text-sm font-semibold text-ink-primary">Published</h2>}
              <DocumentList documents={published} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
