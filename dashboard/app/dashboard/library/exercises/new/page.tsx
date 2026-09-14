import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { createExercise } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewExercisePage({
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
          href="/dashboard/library/exercises"
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Exercises
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">New exercise</h1>
      </div>

      <form action={createExercise} className="flex flex-col gap-4">
        {searchParams.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{searchParams.error}</p>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Name
          <input
            name="name"
            required
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Category <span className="text-ink-muted">(optional)</span>
          <input
            name="category"
            placeholder="e.g. Push, Pull, Legs"
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-primary">
          Instructions <span className="text-ink-muted">(optional)</span>
          <textarea
            name="instructions"
            rows={4}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <MediaUploadField label="Photo" prefix="photo" kind="photo" />
        <MediaUploadField label="Video" prefix="video" kind="video" />

        <button
          type="submit"
          className="w-fit rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
        >
          Create exercise
        </button>
      </form>
    </div>
  );
}
