"use client";

import { useState } from "react";
import Link from "next/link";
import {
  addCoachNote,
  deleteCoachNote,
  updateCoachNote,
  type CoachNoteRow,
} from "@/app/dashboard/clients/[clientId]/notes-actions";

const PREVIEW_COUNT = 3;

export function CoachNotes({
  clientId,
  initialNotes,
  seeAllHref,
  totalCount,
}: {
  clientId: string;
  initialNotes: CoachNoteRow[];
  // Pass seeAllHref only on the dashboard card, where the list is capped at
  // PREVIEW_COUNT notes -- the dedicated notes page renders every note and
  // passes neither prop.
  seeAllHref?: string;
  totalCount?: number;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [count, setCount] = useState(totalCount ?? initialNotes.length);
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<CoachNoteRow | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setSubmitting(true);
    setAddError(null);
    try {
      const formData = new FormData();
      formData.set("body", body);
      if (isPrivate) formData.set("is_private", "on");

      const note = await addCoachNote(clientId, formData);
      setNotes((prev) => [note, ...prev]);
      setCount((prev) => prev + 1);
      setBody("");
      setIsPrivate(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add note.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setCount((prev) => Math.max(0, prev - 1));
    await deleteCoachNote(clientId, noteId);
  }

  function handleUpdated(updated: CoachNoteRow) {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setEditingNote(null);
  }

  const visibleNotes = seeAllHref ? notes.slice(0, PREVIEW_COUNT) : notes;
  const remaining = count - visibleNotes.length;

  return (
    <>
      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          required
          placeholder="Add a note about this client…"
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Keep private (excluded from AI assistant context)
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Adding…" : "Add note"}
          </button>
        </div>
        {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
      </form>

      {visibleNotes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {visibleNotes.map((note) => (
            <li
              key={note.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-[color:var(--page-plane)] p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs text-ink-muted">
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                  {note.is_private && (
                    <span className="rounded-full bg-[color:var(--series-heart)]/20 px-2 py-0.5 text-[10px] font-medium text-[color:var(--series-heart)]">
                      Private
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-ink-primary">{note.body}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => setEditingNote(note)}
                  className="text-xs text-ink-muted hover:text-ink-primary"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(note.id)}
                  className="text-xs text-ink-muted hover:text-red-600 dark:hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {seeAllHref && remaining > 0 && (
        <Link
          href={seeAllHref}
          className="mt-3 inline-block text-xs font-medium text-[color:var(--series-steps)] hover:underline"
        >
          See all {count} notes →
        </Link>
      )}

      {editingNote && (
        <EditNoteModal
          clientId={clientId}
          note={editingNote}
          onCancel={() => setEditingNote(null)}
          onSaved={handleUpdated}
        />
      )}
    </>
  );
}

function EditNoteModal({
  clientId,
  note,
  onCancel,
  onSaved,
}: {
  clientId: string;
  note: CoachNoteRow;
  onCancel: () => void;
  onSaved: (note: CoachNoteRow) => void;
}) {
  const [body, setBody] = useState(note.body);
  const [isPrivate, setIsPrivate] = useState(note.is_private);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CoachNoteRow | null>(null);

  async function handleSave() {
    if (!body.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("body", body);
      if (isPrivate) formData.set("is_private", "on");

      const updated = await updateCoachNote(clientId, note.id, formData);
      setSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update note.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-md rounded-xl bg-surface p-5">
        {saved ? (
          <>
            <h3 className="mb-2 text-sm font-semibold text-ink-primary">Note updated</h3>
            <p className="mb-4 text-sm text-ink-secondary">Your changes have been saved.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onSaved(saved)}
                className="rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="mb-3 text-sm font-semibold text-ink-primary">Edit note</h3>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              required
              className="mb-3 w-full rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
            />
            <label className="mb-4 flex items-center gap-1.5 text-xs text-ink-secondary">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              Keep private (excluded from AI assistant context)
            </label>
            {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
