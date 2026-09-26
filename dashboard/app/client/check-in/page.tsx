import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClientProfile, getCurrentProfile } from "@/lib/profile";
import { resolveMediaUrl } from "@/lib/media";
import { DynamicFormRenderer } from "@/components/library/DynamicFormRenderer";
import { isFileAnswer } from "@/lib/forms";
import { getCurrentCheckIn } from "@/lib/check-ins";
import { submitCheckIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientCheckInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "client") redirect("/dashboard");

  const clientProfile = await getClientProfile(profile.id);
  if (!clientProfile?.onboardedAt) redirect("/onboarding");

  const supabase = await createClient();
  const { template, response } = await getCurrentCheckIn(supabase, profile.id);

  if (!template) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Link href="/client" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Home
        </Link>
        <p className="text-sm text-ink-muted">
          Your coach hasn&apos;t set up a weekly check-in for you yet.
        </p>
      </div>
    );
  }

  const answers = response?.answers ?? {};
  const existingFileUrls: Record<string, string | null> = {};
  await Promise.all(
    template.schema
      .filter((f) => f.type === "file_upload")
      .map(async (f) => {
        const answer = answers[f.id];
        if (isFileAnswer(answer)) {
          existingFileUrls[f.id] = await resolveMediaUrl(supabase, answer.path, null);
        }
      }),
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link href="/client" className="text-sm text-ink-secondary hover:text-ink-primary">
          ← Home
        </Link>
        <h1 className="mt-1 text-h3 font-display font-semibold text-ink-primary">
          {response?.submittedAt ? "Thanks for checking in!" : "Tell me how it was!"}
        </h1>
        <p className="text-sm text-ink-secondary">
          {response?.submittedAt
            ? "You can still update your answers for this week below."
            : `Fill out your ${template.name.toLowerCase()}.`}
        </p>
      </div>

      {searchParams.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
      )}

      <form action={submitCheckIn.bind(null, template.id)} className="flex flex-col gap-5">
        <DynamicFormRenderer
          schema={template.schema}
          existingAnswers={answers}
          existingFileUrls={existingFileUrls}
        />
        <button
          type="submit"
          className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          {response?.submittedAt ? "Update answers" : "Submit"}
        </button>
      </form>
    </div>
  );
}
