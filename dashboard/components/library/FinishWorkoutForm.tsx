"use client";

import { useState, useTransition } from "react";
import { completeSession } from "@/app/client/sessions/actions";

// Notes + "Finish Workout" for an in-progress session. Finishing goes
// through a confirm step (same modal pattern as WorkoutClock's Stop) before
// calling completeSession directly -- which redirects to the session's
// summary page, so there's nothing else to do here on success.
export function FinishWorkoutForm({
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

  function finish() {
    const formData = new FormData();
    if (notes.trim()) formData.set("notes", notes.trim());
    startTransition(async () => {
      await completeSession(workoutId, sessionId, formData);
    });
  }

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">Session notes</h2>
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
          className="w-full rounded-lg bg-[color:var(--series-steps)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          Finish Workout
        </button>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-sm rounded-xl bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink-primary">Finish this workout?</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              You&apos;ll get a summary of what you logged, and can still come back and edit sets
              afterward.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="rounded-lg border border-[color:var(--border-hairline)] px-4 py-2 text-sm text-ink-secondary disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={isPending}
                className="rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
