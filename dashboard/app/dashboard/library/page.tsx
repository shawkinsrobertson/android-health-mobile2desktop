import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/dashboard/library/exercises",
    title: "Exercises",
    description: "The building blocks -- name, instructions, photo or video.",
  },
  {
    href: "/dashboard/library/workouts",
    title: "Workouts",
    description: "Groups of exercises with sets, reps, and rest.",
  },
  {
    href: "/dashboard/library/programs",
    title: "Programs",
    description: "Multi-week plans built from your workouts.",
  },
  {
    href: "/dashboard/library/documents",
    title: "Documents",
    description: "Files to hand off, or forms for clients to fill out.",
  },
];

export default async function LibraryHubPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "coach") redirect("/client");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Library</h1>
        <p className="text-sm text-ink-secondary">
          Build reusable content once, then assign it to any client. Editing something here
          updates it everywhere it&apos;s still unassigned -- once you assign it to a client, that
          copy is frozen and won&apos;t change if you edit the original later.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4 hover:bg-[color:var(--page-plane)]"
          >
            <h2 className="text-sm font-semibold text-ink-primary">{section.title}</h2>
            <p className="mt-1 text-xs text-ink-secondary">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
