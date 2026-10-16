"use client";

import { useState, useTransition } from "react";
import { completeSession } from "@/app/client/sessions/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// The summary page's own notes + final save -- confirming persists any
// notes edit and sends the client back to their dashboard (completeSession
// redirects there when given redirect=dashboard).
export function SaveSummaryForm({
  workoutId,
  sessionId,
  initialNotes,
}: {
  workoutId: string;
  sessionId: string;
  initialNotes: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    const formData = new FormData();
    if (notes.trim()) formData.set("notes", notes.trim());
    formData.set("redirect", "dashboard");
    startTransition(async () => {
      await completeSession(workoutId, sessionId, formData);
    });
  }

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink-primary">Session notes</h2>
      <div className="flex flex-col gap-3">
        <textarea
          rows={3}
          placeholder="How did the whole session go?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={isPending}
          className="w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          Save
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Save & finish?"
        body="This saves your notes and takes you back to your dashboard."
        confirmLabel={isPending ? "Saving…" : "Save"}
        confirmDisabled={isPending}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
