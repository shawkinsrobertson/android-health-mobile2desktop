"use client";

import { useState } from "react";
import { getOrCreateBookingLink } from "@/lib/booking-actions";
import { CopyLinkButton } from "@/components/CopyLinkButton";

// Shared by CalendarCard's compact row and CalendarWorkspace's left
// column -- both just need "show the link if it exists, offer to
// generate one if not." getOrCreateBookingLink() already revalidates the
// pages that read booking_token server-side, so the parent's next render
// picks up the new value the same way calendar sync's handleSync does.
export function BookingLinkControl({ bookingUrl }: { bookingUrl: string | null }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await getOrCreateBookingLink();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a booking link.");
    } finally {
      setGenerating(false);
    }
  }

  if (bookingUrl) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <code className="max-w-[14rem] truncate rounded bg-[color:var(--page-plane)] px-2 py-0.5 text-ink-secondary">
          {bookingUrl}
        </code>
        <CopyLinkButton url={bookingUrl} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="text-[color:var(--accent)] hover:underline disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate booking link"}
      </button>
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
