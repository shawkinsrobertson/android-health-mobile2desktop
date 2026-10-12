"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Coach-level entry point for outcome #5 ("draft documents from a text
// prompt") -- mirrors DraftWorkoutPrompt. Only drafts form-type documents
// (see lib/document-drafting.ts for why file-type documents aren't
// supported here).
export function DraftDocumentPrompt() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = prompt.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/library/documents/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
      router.push(`/dashboard/library/documents/${body.documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draft a document");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4"
    >
      <h2 className="mb-2 text-sm font-semibold text-ink-primary">Draft a form with AI</h2>
      <p className="mb-3 text-xs text-ink-secondary">
        Describe the check-in or intake form you want -- it&apos;ll create a draft for you to review and edit
        before anyone can be assigned it.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Weekly nutrition check-in: meals logged, hunger level, notes"
          disabled={loading}
          className="flex-1 rounded-md border border-[color:var(--border-hairline)] bg-transparent px-3 py-1.5 text-sm text-ink-primary"
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="shrink-0 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {loading ? "Drafting…" : "Draft form"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
