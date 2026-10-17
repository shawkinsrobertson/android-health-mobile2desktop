"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
        className="w-full rounded-lg bg-[color:var(--accent)] px-4 py-3 text-sm font-medium text-white"
      >
        Save
      </button>

      <ConfirmDialog
        open={confirming}
        title="Save these changes?"
        body="This takes you back to the workout summary to finish saving."
        confirmLabel="Save"
        onConfirm={() => router.push(summaryHref)}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
