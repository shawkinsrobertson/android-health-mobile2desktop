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
//
// One persistently-mounted <aside> that transitions width -- rather than
// swapping to an entirely different element on collapse -- so the
// collapse/expand itself eases in and out instead of jumping.
export function LibrarySidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-[color:var(--border-hairline)] bg-surface transition-all duration-200 ${
        collapsed ? "w-12 p-2" : "w-44 p-3"
      }`}
    >
      <div className={`flex items-center ${collapsed ? "justify-center" : "mb-1 justify-between"}`}>
        {!collapsed && (
          <h2 className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Library
          </h2>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand library sidebar" : "Collapse library sidebar"}
          className="shrink-0 rounded-md p-1 text-ink-muted hover:text-ink-primary"
        >
          <ChevronDownIcon
            className={`h-6 w-6 transition-transform duration-200 ${collapsed ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      </div>
      <div
        className={`flex flex-col gap-1 transition-opacity duration-200 ${
          collapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {SECTIONS.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                active
                  ? "bg-[color:var(--accent)]/15 font-medium text-[color:var(--accent)]"
                  : "text-ink-secondary hover:bg-[color:var(--page-plane)]"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
