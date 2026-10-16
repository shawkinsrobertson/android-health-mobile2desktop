"use client";

import { useEffect, useId, useState } from "react";

// Shared confirmation prompt for meaningful/destructive actions (deletes,
// AI-proposal approvals, discards, assignments, publishes) -- mirrors the
// Android app's ui/components/ConfirmDialog.kt shape so both platforms
// confirm the same actions the same way. Every call site should go through
// this one rather than rolling its own modal.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  confirmDisabled,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  // Set while the confirmed action is already in flight, so a second click
  // (e.g. while confirmLabel reads "Saving…") can't re-submit it.
  confirmDisabled?: boolean;
  // Shown inline when the confirmed action itself can fail (most can't --
  // this is for the rare call site, like a network-dependent delete, that
  // needs to surface a retryable error without leaving the dialog.
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`w-full max-w-sm rounded-xl bg-surface p-5 transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <h3 id={titleId} className="mb-2 text-sm font-semibold text-ink-primary">
          {title}
        </h3>
        <p className="mb-4 text-sm text-ink-secondary">{body}</p>
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirmDisabled}
            className="rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink-primary disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`rounded-md px-3 py-2 text-xs font-medium text-white disabled:opacity-60 ${
              destructive ? "bg-danger" : "bg-[color:var(--accent)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
