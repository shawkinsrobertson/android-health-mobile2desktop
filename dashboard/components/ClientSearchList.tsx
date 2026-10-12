"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface ClientListItem {
  profileId: string;
  name: string;
  email: string;
  onboarded: boolean;
}

export function ClientSearchList({ clients }: { clients: ClientListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients…"
        className="mb-3 w-full rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-3 py-1.5 text-sm text-ink-primary"
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted">No clients match &quot;{query}&quot;.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((client) => (
            <li key={client.profileId}>
              <Link
                href={`/dashboard/clients/${client.profileId}`}
                className="flex items-center justify-between rounded-lg bg-[color:var(--page-plane)] px-3 py-2 text-sm hover:bg-[color:var(--border-hairline)]"
              >
                <span className="text-ink-primary">{client.name}</span>
                <span className="text-xs text-ink-muted">
                  {client.onboarded ? "onboarded" : "invited, not onboarded yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
