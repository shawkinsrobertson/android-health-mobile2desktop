"use client";

import { useRef, useState } from "react";

// The calendar's own "schedule everything" entry point (PLANNING.md Phase
// 27's Stage 8) -- reuses the exact same assign-to-client RPCs the
// client-detail page's "Assigned content" picker already calls
// (app/dashboard/clients/[clientId]/assign-actions.ts), just with a date
// field added. Unlike that picker, this modal is expected to close back
// onto the calendar with the new item showing up underneath it, not
// navigate away -- so it calls the *Inline action variants (return the
// new id, never redirect) directly rather than using a plain
// <form action={...}>, and reports success back via [onAssigned] so the
// calendar can refetch and show the new item without a page navigation.
export type AssignKind = "workout" | "program" | "document";

interface AssignOption {
  id: string;
  name: string;
}

export function AssignScheduleModal({
  initialDate,
  workoutOptions,
  programOptions,
  documentOptions,
  assignWorkout,
  assignProgram,
  assignDocument,
  onAssigned,
  onClose,
}: {
  initialDate: string;
  workoutOptions: AssignOption[];
  programOptions: AssignOption[];
  documentOptions: AssignOption[];
  assignWorkout: (formData: FormData) => Promise<string>;
  assignProgram: (formData: FormData) => Promise<string>;
  assignDocument: (formData: FormData) => Promise<string>;
  onAssigned: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<AssignKind>("workout");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const kinds: { value: AssignKind; label: string; options: AssignOption[]; fieldName: string; dateField: string; action: (formData: FormData) => Promise<string> }[] = [
    { value: "workout", label: "Workout", options: workoutOptions, fieldName: "workout_id", dateField: "scheduled_date", action: assignWorkout },
    { value: "program", label: "Program", options: programOptions, fieldName: "program_id", dateField: "start_date", action: assignProgram },
    { value: "document", label: "Document / form", options: documentOptions, fieldName: "document_id", dateField: "scheduled_date", action: assignDocument },
  ];
  const current = kinds.find((k) => k.value === kind)!;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await current.action(new FormData(e.currentTarget));
      onAssigned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't assign that.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-primary">Assign & schedule</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            ✕
          </button>
        </div>

        <div className="mb-3 flex gap-1">
          {kinds.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setKind(k.value);
                setError(null);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                kind === k.value
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-ink-secondary hover:bg-[color:var(--page-plane)]"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {error && <p className="mb-2 text-xs text-danger">{error}</p>}

        {current.options.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No {current.label.toLowerCase()}s in your library yet.
          </p>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
              {current.label}
              <select
                name={current.fieldName}
                required
                className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
              >
                {current.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
              {kind === "program" ? "Start date" : "Scheduled for"}
              <input
                type="date"
                name={current.dateField}
                defaultValue={initialDate}
                required={kind !== "program"}
                className="rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Assigning…" : "Assign"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
