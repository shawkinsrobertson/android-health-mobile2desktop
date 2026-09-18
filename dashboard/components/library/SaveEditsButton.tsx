"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shown on the tracking page when a client re-opens an already-completed
// session to adjust set values (via the summary page's "Edit sets" link).
// Sets/exercises already autosave on blur (see SessionLogger), so this is
// just a confirmed hand-off back to the summary screen, not another write.
export function SaveEditsButton({ summaryHref }: { summaryHref: string }) {
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg bg-[color:var(--series-steps)] px-4 py-3 text-sm font-medium text-white"
      >
        Save
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-xl bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink-primary">Save these changes?</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              This takes you back to the workout summary to finish saving.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-[color:var(--border-hairline)] px-4 py-2 text-sm text-ink-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => router.push(summaryHref)}
                className="rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
