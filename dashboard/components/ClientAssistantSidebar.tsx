"use client";

import { useState } from "react";
import { AssistantChat } from "@/components/AssistantChat";
import { ChevronDownIcon } from "@/components/icons/ChevronDownIcon";

// Right-side collapsible AI assistant panel for the client detail page --
// default minimized per the design requirement ("AI sidebar minimized to
// the right"), expanded on demand. Same collapsible-sidebar shape as
// LibrarySidebar/InboxSidebar, mirrored to the right edge.
export function ClientAssistantSidebar({
  clientId,
  initialMessages,
}: {
  clientId: string;
  initialMessages: { role: "user" | "assistant"; content: string }[];
}) {
  const [collapsed, setCollapsed] = useState(true);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Expand AI assistant"
        className="flex h-fit shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--border-hairline)] bg-surface px-2 py-2 text-ink-secondary hover:bg-[color:var(--page-plane)]"
      >
        <ChevronDownIcon className="h-4 w-4 rotate-90" />
        <span className="text-xs font-medium [writing-mode:vertical-rl]">AI assistant</span>
      </button>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-2 rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-primary">AI assistant</h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse AI assistant"
          className="text-ink-muted hover:text-ink-primary"
        >
          <ChevronDownIcon className="h-4 w-4 -rotate-90" />
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Grounded in this client&apos;s synced data and your non-private notes. Only you see this
        conversation.
      </p>
      <AssistantChat clientId={clientId} initialMessages={initialMessages} />
    </aside>
  );
}
