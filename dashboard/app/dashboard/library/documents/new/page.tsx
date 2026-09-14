import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";
import { NewDocumentForm } from "@/components/library/NewDocumentForm";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <Link
          href="/dashboard/library/documents"
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Documents
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">New document</h1>
      </div>

      {searchParams.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
      )}

      <NewDocumentForm />
    </div>
  );
}
