"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Shared Publish/Delete header actions for the three library item detail
// pages (programs/workouts/documents) -- same shape, same server-action
// signature ((id) => Promise<void>) on every one of them. Publish only
// ever revalidates (no redirect), so a brief "Published ✓" is real;
// delete always redirects away on success, so there's no equivalent
// "Deleted ✓" moment to show -- just "Deleting…" while it's in flight.
export function PublishDeleteActions({
  id,
  itemLabel,
  isDraft,
  onPublish,
  onDelete,
}: {
  id: string;
  itemLabel: string;
  isDraft: boolean;
  onPublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmKind, setConfirmKind] = useState<"publish" | "delete" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function confirmPublish() {
    setConfirmKind(null);
    setPublishing(true);
    startTransition(async () => {
      await onPublish(id);
      setPublishing(false);
      setPublished(true);
      setTimeout(() => setPublished(false), 1500);
    });
  }

  function confirmDelete() {
    setConfirmKind(null);
    setDeleting(true);
    startTransition(async () => {
      await onDelete(id);
      setDeleting(false);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {isDraft && (
          <button
            type="button"
            onClick={() => setConfirmKind("publish")}
            disabled={isPending}
            className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {published ? "Published ✓" : publishing ? "Publishing…" : "Publish"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmKind("delete")}
          disabled={isPending}
          className="rounded-lg border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs text-ink-secondary hover:text-danger disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmKind === "publish"}
        title={`Publish this ${itemLabel}?`}
        body={`Clients will be able to see and get assigned this ${itemLabel} once it's published.`}
        confirmLabel="Publish"
        confirmDisabled={isPending}
        onConfirm={confirmPublish}
        onCancel={() => setConfirmKind(null)}
      />
      <ConfirmDialog
        open={confirmKind === "delete"}
        title={`Delete this ${itemLabel}?`}
        body="This can't be undone."
        confirmLabel="Delete"
        destructive
        confirmDisabled={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmKind(null)}
      />
    </>
  );
}
