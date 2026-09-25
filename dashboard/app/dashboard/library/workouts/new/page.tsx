import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";
import { MediaUploadField } from "@/components/library/MediaUploadField";
import { createWorkout } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewWorkoutPage({
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
          href="/dashboard/library/workouts"
          className="text-sm text-ink-secondary hover:text-ink-primary"
        >
          ← Workouts
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink-primary">New workout</h1>
      </div>

      <form action={createWorkout} className="flex flex-col gap-4">
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
          Description <span className="text-ink-muted">(optional)</span>
          <textarea
            name="description"
            rows={3}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
          />
        </label>

        <MediaUploadField label="Photo" prefix="photo" kind="photo" />
        <MediaUploadField label="Video" prefix="video" kind="video" />

        <button
          type="submit"
          className="w-fit rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Create workout
        </button>
      </form>

      <p className="text-xs text-ink-muted">
        You can add exercises to this workout after creating it.
      </p>
    </div>
  );
}
