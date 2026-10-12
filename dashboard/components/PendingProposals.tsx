"use client";

import { useState } from "react";
import { ProposalCard } from "./ProposalCard";
import { approveDraftMessageProposal, discardProposal } from "@/app/dashboard/clients/[clientId]/proposal-actions";
import type { Proposal } from "@/lib/proposals";

const TYPE_LABELS: Record<Proposal["type"], string> = {
  draft_message: "Draft message",
  program_change: "Program change",
  schedule_call: "Schedule call",
};

// First real consumer of ProposalCard -- see lib/proposals.ts for why
// program_change/schedule_call fall through to a plain summary-only card
// for now (their own apply actions land in Stage 6/7).
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
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">Pending review</h2>
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

          // program_change / schedule_call: created by no tool yet
          // (Stage 6/7), so this path isn't reachable today -- kept so a
          // row of a future type still renders something instead of
          // silently vanishing from the list once those stages add tools
          // that create them ahead of their own apply action landing.
          return (
            <ProposalCard
              key={proposal.id}
              typeLabel={typeLabel}
              summary={proposal.summary}
              createdAt={proposal.createdAt}
              onApprove={async () => {
                throw new Error("Approving this proposal type isn't available yet.");
              }}
              onDiscard={async () => {
                await discardProposal(clientId, proposal.id);
                remove(proposal.id);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
