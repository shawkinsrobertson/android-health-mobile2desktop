"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "@/components/icons/ChevronDownIcon";

const SECTIONS = [
  { href: "/dashboard/library/exercises", label: "Exercises" },
  { href: "/dashboard/library/workouts", label: "Workouts" },
  { href: "/dashboard/library/programs", label: "Programs" },
  { href: "/dashboard/library/documents", label: "Documents" },
];

// Persistent (not per-route-reset) left sidebar for every /dashboard/library/**
// page -- first sidebar pattern in this app, so there's no existing
// convention to match beyond the app's usual card styling. Collapse state
// is plain useState (not persisted across page loads/localStorage): it's a
// same-session convenience, not data worth persisting.
export function LibrarySidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Expand library sidebar"
        className="h-fit rounded-lg border border-[color:var(--border-hairline)] bg-surface p-2 text-ink-secondary hover:bg-[color:var(--page-plane)]"
      >
        <ChevronDownIcon className="h-4 w-4 -rotate-90" />
      </button>
    );
  }

  return (
    <aside className="flex w-44 shrink-0 flex-col gap-1 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Library</h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse library sidebar"
          className="text-ink-muted hover:text-ink-primary"
        >
          <ChevronDownIcon className="h-4 w-4 rotate-90" />
        </button>
      </div>
      {SECTIONS.map((section) => {
        const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              active
                ? "bg-[color:var(--accent)]/15 font-medium text-[color:var(--accent)]"
                : "text-ink-secondary hover:bg-[color:var(--page-plane)]"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </aside>
  );
}
