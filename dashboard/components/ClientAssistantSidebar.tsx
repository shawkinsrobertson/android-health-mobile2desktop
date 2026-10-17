"use client";

import { useState } from "react";
import { AssistantChat } from "@/components/AssistantChat";
import { ChevronDownIcon } from "@/components/icons/ChevronDownIcon";

// Right-side collapsible AI assistant panel for the client detail page --
// default minimized per the design requirement ("AI sidebar minimized to
// the right"), expanded on demand. Same collapsible-sidebar shape as
// LibrarySidebar/InboxSidebar, mirrored to the right edge: one
// persistently-mounted <aside> that transitions width/opacity instead of
// swapping to an entirely different element on collapse.
export function ClientAssistantSidebar({
  clientId,
  initialMessages,
}: {
  clientId: string;
  initialMessages: { role: "user" | "assistant"; content: string }[];
}) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <aside
      className={`flex shrink-0 flex-col gap-2 overflow-hidden rounded-xl border border-[color:var(--border-hairline)] bg-surface transition-all duration-200 ${
        collapsed ? "w-16 p-2" : "w-80 p-4"
      }`}
    >
      <div className={`flex items-center ${collapsed ? "flex-col gap-1.5" : "justify-between"}`}>
        {!collapsed && <h2 className="whitespace-nowrap text-sm font-semibold text-ink-primary">AI assistant</h2>}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand AI assistant" : "Collapse AI assistant"}
          className="shrink-0 rounded-md p-1 text-ink-muted hover:text-ink-primary"
        >
          <ChevronDownIcon
            className={`h-6 w-6 transition-transform duration-200 ${collapsed ? "rotate-90" : "-rotate-90"}`}
          />
        </button>
        {collapsed && (
          <span className="whitespace-nowrap text-xs font-medium [writing-mode:vertical-rl]">AI assistant</span>
        )}
      </div>

      <div
        className={`flex flex-1 flex-col gap-2 transition-opacity duration-200 ${
          collapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <p className="text-xs text-ink-muted">
          Grounded in this client&apos;s synced data and your non-private notes. Only you see this
          conversation.
        </p>
        <AssistantChat clientId={clientId} initialMessages={initialMessages} />
      </div>
    </aside>
  );
}
