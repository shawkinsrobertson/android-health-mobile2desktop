"use client";

import { useState, useTransition } from "react";
import { updateWeightUnit } from "@/app/client/actions";

// Weight-unit preference save on the client dashboard -- a low-risk,
// high-frequency preference toggle, so it stays confirmation-free per the
// app's own confirm/undo scope, but it still deserves the same in-place
// "Save -> Saving... -> Saved check" feedback every other save action gets.
export function WeightUnitForm({ initialUnit }: { initialUnit: "lbs" | "kg" }) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await updateWeightUnit(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <form action={handleSubmit} className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-sm text-ink-primary">
        <input type="radio" name="preferred_weight_unit" value="lbs" defaultChecked={initialUnit === "lbs"} />
        lbs
      </label>
      <label className="flex items-center gap-1.5 text-sm text-ink-primary">
        <input type="radio" name="preferred_weight_unit" value="kg" defaultChecked={initialUnit === "kg"} />
        kg
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        {saved ? "Saved ✓" : isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
