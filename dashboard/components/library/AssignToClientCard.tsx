"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Assigning freezes a personal copy for that client (see the library hub's
// own description: an edit after assignment no longer reaches it) -- a
// meaningful, one-way action per the app's confirm/undo scope, so it goes
// through the same confirm step as deletes/discards/publishes.
export function AssignToClientCard({
  itemId,
  action,
  clients,
  itemLabel,
}: {
  itemId: string;
  action: (itemId: string, formData: FormData) => Promise<void>;
  clients: { id: string; name: string }[];
  itemLabel: string;
}) {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedClientName = clients.find((c) => c.id === selectedClientId)?.name ?? "this client";

  function confirmAssign() {
    setConfirming(false);
    const formData = new FormData();
    formData.set("client_id", selectedClientId);
    startTransition(async () => {
      await action(itemId, formData);
    });
  }

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink-primary">Assign to client</h2>
      {clients.length === 0 ? (
        <p className="text-sm text-ink-muted">No clients yet to assign this {itemLabel} to.</p>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="flex-1 rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-3 py-1.5 text-sm text-ink-primary"
          >
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!selectedClientId || isPending}
            className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {isPending ? "Assigning…" : "Assign"}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Assign this ${itemLabel}?`}
        body={`${selectedClientName} gets this ${itemLabel} as a personal copy, frozen from the original from this point on.`}
        confirmLabel="Assign"
        confirmDisabled={isPending}
        onConfirm={confirmAssign}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
