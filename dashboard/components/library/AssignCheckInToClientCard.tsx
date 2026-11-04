"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // isodow 1..7

// Assigning a check-in needs a recurrence pattern (which weekday(s) it
// opens on) and a start date, unlike a plain one-shot assign -- see
// assign_check_in_to_client (0045_check_ins_assignments.sql), which
// computes the actual first occurrence date itself from these.
export function AssignCheckInToClientCard({
  itemId,
  action,
  clients,
}: {
  itemId: string;
  action: (itemId: string, formData: FormData) => Promise<void>;
  clients: { id: string; name: string }[];
}) {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Monday by default
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedClientName = clients.find((c) => c.id === selectedClientId)?.name ?? "this client";

  function toggleDay(isodow: number) {
    setSelectedDays((prev) => (prev.includes(isodow) ? prev.filter((d) => d !== isodow) : [...prev, isodow].sort()));
  }

  function confirmAssign() {
    setConfirming(false);
    const formData = new FormData();
    formData.set("client_id", selectedClientId);
    formData.set("recurrence_days_of_week", JSON.stringify(selectedDays));
    formData.set("start_date", startDate);
    startTransition(async () => {
      await action(itemId, formData);
    });
  }

  const canAssign = !!selectedClientId && selectedDays.length > 0;

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink-primary">Assign to client</h2>
      {clients.length === 0 ? (
        <p className="text-sm text-ink-muted">No clients yet to assign this check-in to.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-3 py-1.5 text-sm text-ink-primary"
          >
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div>
            <p className="mb-1 text-xs font-medium text-ink-secondary">Opens on</p>
            <div className="flex gap-1">
              {DAY_LABELS.map((label, idx) => {
                const isodow = idx + 1;
                const active = selectedDays.includes(isodow);
                return (
                  <button
                    key={isodow}
                    type="button"
                    onClick={() => toggleDay(isodow)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      active
                        ? "bg-[color:var(--accent)] text-white"
                        : "border border-[color:var(--border-hairline)] text-ink-secondary"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
            Starting
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-3 py-1.5 text-sm text-ink-primary"
            />
          </label>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canAssign || isPending}
            className="w-fit rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {isPending ? "Assigning…" : "Assign"}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Assign this check-in?"
        body={`${selectedClientName} gets this as a recurring weekly check-in, starting the next matching day on or after ${startDate}. Editing the original afterward won't change what's already assigned.`}
        confirmLabel="Assign"
        confirmDisabled={isPending}
        onConfirm={confirmAssign}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
