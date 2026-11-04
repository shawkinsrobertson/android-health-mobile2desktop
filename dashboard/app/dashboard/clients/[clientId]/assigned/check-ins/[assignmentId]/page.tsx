import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { DynamicFormRenderer } from "@/components/library/DynamicFormRenderer";
import { isFileAnswer, type FormSchema } from "@/lib/forms";
import { getCheckInOccurrence, listCheckInOccurrencesForSeries } from "@/lib/check-ins";

export const dynamic = "force-dynamic";

// Takes ANY occurrence id in a series (the recurring source row, or one
// of its generated weeks -- see 0045_check_ins_assignments.sql) and
// shows the whole series' history, newest first, each week's answers
// inline -- the coach-side counterpart to the document assignment
// response viewer (app/dashboard/clients/[clientId]/assigned/documents/
// [assignedDocumentId]/page.tsx), which only ever has one response to
// show per assignment; a check-in has one per week, so this is a list
// instead of a single section.
export default async function CheckInSeriesPage({
  params,
}: {
  params: { clientId: string; assignmentId: string };
}) {
  const coach = await getCurrentProfile();
  if (!coach) redirect("/login");
  if (coach.role !== "coach") redirect("/client");

  const supabase = await createClient();

  // getCheckInOccurrence checks client_id but not coach_id -- re-verify
  // ownership via a direct coach_id check on the same row, same pattern
  // every other assigned-* coach page uses.
  const [occurrence, { data: ownedRow }] = await Promise.all([
    getCheckInOccurrence(supabase, params.assignmentId, params.clientId),
    supabase
      .from("assignments")
      .select("id")
      .eq("id", params.assignmentId)
      .eq("coach_id", coach.id)
      .eq("type", "check_in")
      .maybeSingle(),
  ]);

  if (!occurrence || !ownedRow) redirect(`/dashboard/clients/${params.clientId}`);

  const [{ data: client }, history] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", params.clientId).single(),
    listCheckInOccurrencesForSeries(supabase, occurrence.seriesSourceId),
  ]);

  const schema = occurrence.schema;
  const existingFileUrlsByOccurrence: Record<string, Record<string, string | null>> = {};
  await Promise.all(
    history.map(async (week) => {
      const urls: Record<string, string | null> = {};
      await Promise.all(
        schema
          .filter((f) => f.type === "file_upload")
          .map(async (f) => {
            const answer = week.answers[f.id];
            if (isFileAnswer(answer)) {
              urls[f.id] = await resolveMediaUrl(supabase, answer.path, null);
            }
          }),
      );
      existingFileUrlsByOccurrence[week.id] = urls;
    }),
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/clients/${params.clientId}`}
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← {client?.full_name || client?.email || "Client"}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">{occurrence.name}</h1>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-ink-muted">No occurrences yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {history.map((week) => (
            <li key={week.id} className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink-primary">
                  Week of {new Date(`${week.scheduledDate}T00:00:00Z`).toLocaleDateString()}
                </h2>
                {week.submittedAt ? (
                  <span className="rounded-full bg-[color:var(--series-sleep)]/20 px-2 py-0.5 text-xs font-medium text-[color:var(--series-sleep)]">
                    Submitted
                  </span>
                ) : (
                  <span className="rounded-full bg-[color:var(--border-hairline)] px-2 py-0.5 text-xs font-medium text-ink-muted">
                    No response
                  </span>
                )}
              </div>
              {week.submittedAt ? (
                <DynamicFormRenderer
                  schema={schema}
                  existingAnswers={week.answers}
                  existingFileUrls={existingFileUrlsByOccurrence[week.id] ?? {}}
                  readOnly
                />
              ) : (
                <p className="text-sm text-ink-muted">The client hasn&apos;t submitted this week yet.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
