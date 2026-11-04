"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export function ArchiveClientButton({
  clientName,
  archiveClient,
}: {
  clientName: string;
  archiveClient: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-ink-muted hover:text-danger"
      >
        Archive client
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Archive ${clientName}?`}
        body="Removes them from your active client list. Nothing is deleted -- their history, sessions, and messages all stay intact, and you can unarchive them from the Clients page at any time."
        confirmLabel="Archive"
        destructive
        confirmDisabled={isPending}
        onConfirm={() => startTransition(() => archiveClient())}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
