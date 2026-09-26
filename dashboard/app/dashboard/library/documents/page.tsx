import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

interface DocumentRow {
  id: string;
  name: string;
  description: string | null;
  document_type: "file" | "form";
}

export default async function DocumentLibraryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("library_documents")
    .select("id, name, description, document_type")
    .order("name");

  const documents = (data ?? []) as DocumentRow[];

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

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load documents: {error.message}
        </p>
      ) : documents.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 text-sm text-ink-muted">
          No documents yet -- upload a file or build a form.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/dashboard/library/documents/${doc.id}`}
                className="flex items-center justify-between rounded-xl border border-[color:var(--border-hairline)] bg-surface p-3 hover:bg-[color:var(--page-plane)]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink-primary">{doc.name}</div>
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
      )}
    </div>
  );
}
