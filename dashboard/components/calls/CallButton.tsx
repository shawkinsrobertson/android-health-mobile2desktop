"use client";

import { useCall } from "./CallProvider";

export function CallButton() {
  const { call, isBusy, placeCall } = useCall();

  return (
    <button
      type="button"
      onClick={placeCall}
      disabled={isBusy || !!call}
      className="flex items-center gap-1 rounded-md border border-[color:var(--border-hairline)] px-2 py-1 text-xs font-medium text-ink-secondary hover:text-ink-primary disabled:opacity-50"
      aria-label="Start a call"
    >
      📞 Call
    </button>
  );
}
