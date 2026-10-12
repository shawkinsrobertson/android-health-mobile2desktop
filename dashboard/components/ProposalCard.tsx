"use client";

import { useState } from "react";
import type { ReactNode } from "react";

// Generic review shell for one pending ai_assistant_proposals row.
// Type-specific detail rendering is the children slot; type-specific
// approval is the onApprove prop -- this component only knows how to
// discard (always the same: nothing was ever applied) and how to call
// whatever approve function its caller supplied.
export function ProposalCard({
  typeLabel,
  summary,
  createdAt,
  onApprove,
  onDiscard,
  approveLabel = "Approve",
  children,
}: {
  typeLabel: string;
  summary: string;
  createdAt: string;
  onApprove: () => Promise<void>;
  onDiscard: () => Promise<void>;
  approveLabel?: string;
  children?: ReactNode;
}) {
  const [pending, setPending] = useState<"approve" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: "approve" | "discard", fn: () => Promise<void>) {
    setPending(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 text-[11px] font-medium text-[color:var(--accent)]">
          {typeLabel}
        </span>
        <span className="text-[11px] text-ink-muted">{new Date(createdAt).toLocaleString()}</span>
      </div>
      <p className="mb-2 text-sm text-ink-primary">{summary}</p>
      {children}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => handle("approve", onApprove)}
          disabled={pending !== null}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending === "approve" ? "Working…" : approveLabel}
        </button>
        <button
          type="button"
          onClick={() => handle("discard", onDiscard)}
          disabled={pending !== null}
          className="rounded-md border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary disabled:opacity-50"
        >
          {pending === "discard" ? "Working…" : "Discard"}
        </button>
      </div>
    </div>
  );
}
