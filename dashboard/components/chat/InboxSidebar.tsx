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
// per-thread page.
export function InboxSidebar({ threads }: { threads: InboxThreadItem[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Expand inbox sidebar"
        className="h-fit rounded-lg border border-[color:var(--border-hairline)] bg-surface p-2 text-ink-secondary hover:bg-[color:var(--page-plane)]"
      >
        <ChevronDownIcon className="h-4 w-4 -rotate-90" />
      </button>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Inbox</h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse inbox sidebar"
          className="text-ink-muted hover:text-ink-primary"
        >
          <ChevronDownIcon className="h-4 w-4 rotate-90" />
        </button>
      </div>
      {threads.length === 0 ? (
        <p className="px-3 py-1.5 text-sm text-ink-muted">No clients yet.</p>
      ) : (
        threads.map((t) => {
          const href = `/dashboard/inbox/${t.clientId}`;
          const active = pathname === href;
          return (
            <Link
              key={t.clientId}
              href={href}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${
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
    </aside>
  );
}
