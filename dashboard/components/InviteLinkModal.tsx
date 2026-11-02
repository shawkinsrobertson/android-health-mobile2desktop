"use client";

import { useState } from "react";

// Replaces the old bare "Generate invite link" button with a modal that
// lets a coach name the link after the client they're sending it to, so
// the pending-links list below (ClientsPage) reads as "who's this for"
// instead of a wall of indistinguishable token URLs. createInviteLink
// itself never redirects -- it just inserts and revalidates the page's
// own data -- so a direct call + close-on-success is enough; no local
// list state to sync, Next re-fetches the server-rendered list on its
// own once the action settles.
export function InviteLinkModal({
  createInviteLink,
}: {
  createInviteLink: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createInviteLink(new FormData(e.currentTarget));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the invite link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
      >
        Generate invite link
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-primary">New invite link</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink-primary">
                ✕
              </button>
            </div>

            {error && <p className="mb-2 text-xs text-danger">{error}</p>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
                Client&apos;s name (optional)
                <input
                  type="text"
                  name="client_name"
                  placeholder="e.g. Jamie Lee"
                  autoFocus
                  className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Generate link"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
