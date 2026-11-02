"use client";

import { useEffect, useState } from "react";
import { saveInsightAsNote } from "@/app/dashboard/clients/[clientId]/notes-actions";

interface Insight {
  id: string;
  body: string;
  createdAt: string;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 1 day

// Proactive counterpart to AssistantChat -- auto-generates a fresh
// observation if the last one is missing or stale (so a coach opening a
// client they haven't seen in a few days gets one on page load without a
// click), otherwise just shows the last one with a manual refresh.
export function ClientInsights({ clientId, initialInsight }: { clientId: string; initialInsight: Insight | null }) {
  const [insight, setInsight] = useState<Insight | null>(initialInsight);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveToNotes() {
    if (!insight) return;
    setSaving(true);
    setError(null);
    try {
      await saveInsightAsNote(clientId, insight.body);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this insight");
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/insights`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
      setInsight(body.insight);
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate an insight");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const isStale = !insight || Date.now() - new Date(insight.createdAt).getTime() > STALE_AFTER_MS;
    if (isStale) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-primary">Coaching insight</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-xs text-[color:var(--accent)] hover:underline disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : loading && !insight ? (
        <p className="text-sm text-ink-muted">Reviewing this client&apos;s recent data…</p>
      ) : insight ? (
        <>
          <p className="text-sm text-ink-primary">{insight.body}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-ink-muted">{new Date(insight.createdAt).toLocaleString()}</p>
            <button
              type="button"
              onClick={saveToNotes}
              disabled={saving || saved}
              className="text-xs text-[color:var(--accent)] hover:underline disabled:opacity-50"
            >
              {saved ? "Saved to notes" : saving ? "Saving…" : "Save to notes"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted">No observation yet.</p>
      )}
    </section>
  );
}
