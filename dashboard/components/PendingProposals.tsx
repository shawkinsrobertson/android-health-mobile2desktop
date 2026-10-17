"use client";

import { useState } from "react";
import { ProposalCard } from "./ProposalCard";
import {
  approveDraftMessageProposal,
  approveProgramChangeProposal,
  approveScheduleCallProposal,
  discardProposal,
} from "@/app/dashboard/clients/[clientId]/proposal-actions";
import type { Proposal } from "@/lib/proposals";

const TYPE_LABELS: Record<Proposal["type"], string> = {
  draft_message: "Draft message",
  program_change: "Program change",
  schedule_call: "Schedule call",
};

interface ExercisePrescription {
  sets: number | null;
  reps: string | null;
  weightNote: string | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
}

interface ProgramChangeItem {
  action: "update" | "add" | "remove";
  exerciseId?: string;
  exerciseName?: string;
  name?: string;
  before?: ExercisePrescription;
  after?: ExercisePrescription;
  prescription?: ExercisePrescription;
}

interface ProgramChangePayload {
  assignedWorkoutId: string;
  assignedWorkoutName: string;
  changes: ProgramChangeItem[];
}

interface ScheduleCallPayload {
  startTime: string;
  endTime: string;
  title: string;
  notes: string | null;
}

function formatCallWindow(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const dateLabel = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const startLabel = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateLabel}, ${startLabel} - ${endLabel}`;
}

const PRESCRIPTION_LABELS: { key: keyof ExercisePrescription; label: string }[] = [
  { key: "sets", label: "Sets" },
  { key: "reps", label: "Reps" },
  { key: "weightNote", label: "Weight" },
  { key: "restSeconds", label: "Rest (s)" },
  { key: "tempo", label: "Tempo" },
  { key: "notes", label: "Notes" },
];

// Renders one proposed change's diff -- update shows only the fields that
// actually changed (before -> after), add/remove show the full
// prescription since there's no "before" (add) or no "after" (remove) to
// narrow against.
function ProgramChangeDiff({ change }: { change: ProgramChangeItem }) {
  if (change.action === "add") {
    const fields = PRESCRIPTION_LABELS.filter(({ key }) => change.prescription?.[key] != null);
    return (
      <div className="text-sm text-ink-primary">
        <span className="font-medium">+ Add {change.name}</span>
        {fields.length > 0 && (
          <ul className="mt-0.5 ml-4 list-disc text-ink-secondary">
            {fields.map(({ key, label }) => (
              <li key={key}>
                {label}: {change.prescription?.[key]}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (change.action === "remove") {
    return (
      <div className="text-sm text-ink-primary">
        <span className="font-medium">- Remove {change.exerciseName}</span>
      </div>
    );
  }

  const fields = PRESCRIPTION_LABELS.filter(
    ({ key }) => change.before?.[key] !== change.after?.[key],
  );
  return (
    <div className="text-sm text-ink-primary">
      <span className="font-medium">{change.exerciseName}</span>
      {fields.length > 0 ? (
        <ul className="mt-0.5 ml-4 list-disc text-ink-secondary">
          {fields.map(({ key, label }) => (
            <li key={key}>
              {label}: {String(change.before?.[key] ?? "--")} → {String(change.after?.[key] ?? "--")}
            </li>
          ))}
        </ul>
      ) : (
        <span className="ml-1 text-ink-secondary">(no change)</span>
      )}
    </div>
  );
}

// First real consumer of ProposalCard -- one branch per proposal type,
// each wired to its own outcome-specific apply action.
export function PendingProposals({ clientId, initialProposals }: { clientId: string; initialProposals: Proposal[] }) {
  const [proposals, setProposals] = useState(initialProposals);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialProposals
        .filter((p) => p.type === "draft_message")
        .map((p) => [p.id, (p.payload as { body: string }).body]),
    ),
  );

  function remove(id: string) {
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }

  if (proposals.length === 0) return null;

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink-primary">Pending review</h2>
      <div className="flex flex-col gap-2">
        {proposals.map((proposal) => {
          const typeLabel = TYPE_LABELS[proposal.type];

          if (proposal.type === "draft_message") {
            const body = drafts[proposal.id] ?? (proposal.payload as { body: string }).body;
            return (
              <ProposalCard
                key={proposal.id}
                typeLabel={typeLabel}
                summary="Drafted message to this client -- edit below if you want, then send."
                createdAt={proposal.createdAt}
                approveLabel="Send"
                onApprove={async () => {
                  await approveDraftMessageProposal(clientId, proposal.id, body);
                  remove(proposal.id);
                }}
                onDiscard={async () => {
                  await discardProposal(clientId, proposal.id);
                  remove(proposal.id);
                }}
              >
                <textarea
                  value={body}
                  onChange={(e) => setDrafts((d) => ({ ...d, [proposal.id]: e.target.value }))}
                  rows={3}
                  className="mb-1 w-full rounded-md border border-[color:var(--border-hairline)] bg-transparent px-2 py-1.5 text-sm text-ink-primary"
                />
              </ProposalCard>
            );
          }

          if (proposal.type === "program_change") {
            const { assignedWorkoutName, changes } = proposal.payload as ProgramChangePayload;
            return (
              <ProposalCard
                key={proposal.id}
                typeLabel={typeLabel}
                summary={`${proposal.summary} (${assignedWorkoutName})`}
                createdAt={proposal.createdAt}
                approveLabel="Apply to program"
                onApprove={async () => {
                  await approveProgramChangeProposal(clientId, proposal.id);
                  remove(proposal.id);
                }}
                onDiscard={async () => {
                  await discardProposal(clientId, proposal.id);
                  remove(proposal.id);
                }}
              >
                <div className="mb-1 flex flex-col gap-1.5">
                  {changes.map((change, i) => (
                    <ProgramChangeDiff key={change.exerciseId ?? `${change.action}-${i}`} change={change} />
                  ))}
                </div>
              </ProposalCard>
            );
          }

          // schedule_call is the only remaining type.
          const { startTime, endTime, title, notes } = proposal.payload as ScheduleCallPayload;
          return (
            <ProposalCard
              key={proposal.id}
              typeLabel={typeLabel}
              summary={`${title} -- ${formatCallWindow(startTime, endTime)}`}
              createdAt={proposal.createdAt}
              approveLabel="Book call"
              onApprove={async () => {
                await approveScheduleCallProposal(clientId, proposal.id);
                remove(proposal.id);
              }}
              onDiscard={async () => {
                await discardProposal(clientId, proposal.id);
                remove(proposal.id);
              }}
            >
              {notes && <p className="mb-1 text-sm text-ink-secondary">{notes}</p>}
            </ProposalCard>
          );
        })}
      </div>
    </section>
  );
}
