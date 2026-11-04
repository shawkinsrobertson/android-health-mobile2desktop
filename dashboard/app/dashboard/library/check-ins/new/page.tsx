import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";
import { NewCheckInForm } from "@/components/library/NewCheckInForm";

export const dynamic = "force-dynamic";

export default async function NewCheckInPage({
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
          href="/dashboard/library/check-ins"
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Check-ins
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">New check-in</h1>
      </div>

      {searchParams.error && <p className="text-sm text-danger">{searchParams.error}</p>}

      <NewCheckInForm />
    </div>
  );
}
