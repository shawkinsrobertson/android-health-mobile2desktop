import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { DynamicFormRenderer } from "@/components/library/DynamicFormRenderer";
import { isFileAnswer, type FormAnswers, type FormSchema } from "@/lib/forms";
import { submitDocumentResponse } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClientDocumentPage({
  params,
  searchParams,
}: {
  params: { assignedDocumentId: string };
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();

  const { data: doc, error } = await supabase
    .from("assigned_documents")
    .select("id, name, description, document_type, file_path, file_url, form_schema")
    .eq("id", params.assignedDocumentId)
    .eq("client_id", profile.id)
    .single();

  if (error || !doc) redirect("/client/assigned");

  const fileUrl =
    doc.document_type === "file" ? await resolveMediaUrl(supabase, doc.file_path, doc.file_url) : null;

  const { data: response } =
    doc.document_type === "form"
      ? await supabase
          .from("document_responses")
          .select("answers, submitted_at")
          .eq("assigned_document_id", doc.id)
          .maybeSingle()
      : { data: null };

  const answers = (response?.answers ?? {}) as FormAnswers;
  const schema = (doc.form_schema ?? []) as FormSchema;

  const existingFileUrls: Record<string, string | null> = {};
  if (doc.document_type === "form") {
    await Promise.all(
      schema
        .filter((f) => f.type === "file_upload")
        .map(async (f) => {
          const answer = answers[f.id];
          if (isFileAnswer(answer)) {
            existingFileUrls[f.id] = await resolveMediaUrl(supabase, answer.path, null);
          }
        }),
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link href="/client/assigned" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Your training
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{doc.name}</h1>
      </div>

      {doc.description && <p className="text-sm text-ink-secondary">{doc.description}</p>}

      {searchParams.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
      )}

      {doc.document_type === "file" ? (
        fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
          >
            Open file
          </a>
        ) : (
          <p className="text-sm text-ink-muted">No file on record.</p>
        )
      ) : (
        <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
          {response?.submitted_at && (
            <p className="mb-3 text-xs text-ink-muted">
              Last submitted {new Date(response.submitted_at).toLocaleString()} -- you can update it below.
            </p>
          )}
          <form action={submitDocumentResponse.bind(null, doc.id)} className="flex flex-col gap-4">
            <DynamicFormRenderer schema={schema} existingAnswers={answers} existingFileUrls={existingFileUrls} />
            <button
              type="submit"
              className="w-fit rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
            >
              Submit
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
