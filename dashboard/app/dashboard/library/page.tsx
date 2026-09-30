import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function LibraryHubPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold text-ink-primary">Library</h1>
      <p className="text-sm text-ink-secondary">
        Pick a category from the sidebar to see and edit your content. Editing something here
        updates it everywhere it&apos;s still unassigned -- once you assign it to a client, that
        copy is frozen and won&apos;t change if you edit the original later.
      </p>
    </div>
  );
}
