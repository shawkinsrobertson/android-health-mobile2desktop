"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Coach-level entry point for drafting a multi-workout program from a
// text prompt -- same shape as DraftWorkoutPrompt.tsx, not tied to any
// client. On success the new draft (library_programs.status = 'draft')
// is immediately visible in the list below, and the coach is taken
// straight to it to review.
export function DraftProgramPrompt() {
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
      const res = await fetch("/api/library/programs/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
      router.push(`/dashboard/library/programs/${body.programId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draft a program");
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
      <h2 className="mb-2 text-sm font-semibold text-ink-primary">Draft a program with AI</h2>
      <p className="mb-3 text-xs text-ink-secondary">
        Describe the weekly pattern -- it&apos;ll draft the workouts it needs and assemble a program for you to
        review and edit before anyone can be assigned it. This can take a little longer than drafting a single
        workout.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. 3 days/week running program -- easy run, tempo run, long run"
          disabled={loading}
          className="flex-1 rounded-md border border-[color:var(--border-hairline)] bg-transparent px-3 py-1.5 text-sm text-ink-primary"
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="shrink-0 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {loading ? "Drafting…" : "Draft program"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
