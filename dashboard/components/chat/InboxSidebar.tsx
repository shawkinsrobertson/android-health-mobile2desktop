"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "@/components/icons/ChevronDownIcon";

export interface InboxThreadItem {
  clientId: string;
  clientName: string;
  unread: boolean;
  lastMessageAt: string | null;
}

// Same collapsible-left-sidebar pattern as LibrarySidebar -- persistent
// across thread switches since it lives in the shared layout, not the
// per-thread page. One persistently-mounted <aside> that transitions
// width/opacity, rather than swapping to an entirely different element on
// collapse, so the collapse/expand itself eases in and out.
export function InboxSidebar({ threads }: { threads: InboxThreadItem[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-[color:var(--border-hairline)] bg-surface transition-all duration-200 ${
        collapsed ? "w-12 p-2" : "w-56 p-3"
      }`}
    >
      <div className={`flex items-center ${collapsed ? "justify-center" : "mb-1 justify-between"}`}>
        {!collapsed && (
          <h2 className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Inbox
          </h2>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand inbox sidebar" : "Collapse inbox sidebar"}
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
        {threads.length === 0 ? (
          <p className="whitespace-nowrap px-3 py-1.5 text-sm text-ink-muted">No clients yet.</p>
        ) : (
          threads.map((t) => {
            const href = `/dashboard/inbox/${t.clientId}`;
            const active = pathname === href;
            return (
              <Link
                key={t.clientId}
                href={href}
                className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                  active
                    ? "bg-[color:var(--accent)]/15 font-medium text-[color:var(--accent)]"
                    : "text-ink-secondary hover:bg-[color:var(--page-plane)]"
                }`}
              >
                <span className="truncate">{t.clientName}</span>
                {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" aria-label="Unread" />}
              </Link>
            );
          })
        )}
      </div>
    </aside>
  );
}
