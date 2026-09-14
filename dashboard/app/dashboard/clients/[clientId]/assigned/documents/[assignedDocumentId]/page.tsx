import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { DynamicFormRenderer } from "@/components/library/DynamicFormRenderer";
import { isFileAnswer, type FormAnswers, type FormSchema } from "@/lib/forms";

export const dynamic = "force-dynamic";

export default async function AssignedDocumentPage({
  params,
}: {
  params: { clientId: string; assignedDocumentId: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  const { data: doc, error } = await supabase
    .from("assigned_documents")
    .select("id, name, description, document_type, file_path, file_url, form_schema, assigned_at")
    .eq("id", params.assignedDocumentId)
    .eq("client_id", params.clientId)
    .eq("coach_id", coach.id)
    .single();

  if (error || !doc) redirect(`/dashboard/clients/${params.clientId}`);

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
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Back
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{doc.name}</h1>
        <p className="text-xs text-ink-muted">
          Assigned {new Date(doc.assigned_at).toLocaleDateString()}
        </p>
      </div>

      {doc.description && <p className="text-sm text-ink-secondary">{doc.description}</p>}

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
          <h2 className="mb-3 text-sm font-semibold text-ink-primary">Response</h2>
          {!response ? (
            <p className="text-sm text-ink-muted">The client hasn&apos;t submitted this yet.</p>
          ) : (
            <>
              {response.submitted_at && (
                <p className="mb-3 text-xs text-ink-muted">
                  Submitted {new Date(response.submitted_at).toLocaleString()}
                </p>
              )}
              <DynamicFormRenderer
                schema={schema}
                existingAnswers={answers}
                existingFileUrls={existingFileUrls}
                readOnly
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
