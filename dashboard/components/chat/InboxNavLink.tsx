"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { isThreadUnread, type ChatThreadRow } from "@/lib/chat";

// NavBar's "Inbox" link, live: tracks unread-ness per thread (a coach has
// one per client; a client has exactly one) so the yellow dot updates the
// instant a new message or a read-receipt lands, without a page refresh.
export function InboxNavLink({
  href,
  role,
  profileId,
  initialThreads,
}: {
  href: string;
  role: "coach" | "client";
  profileId: string;
  initialThreads: { id: string; unread: boolean }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialThreads.map((t) => [t.id, t.unread])),
  );

  useEffect(() => {
    const filterColumn = role === "coach" ? "coach_id" : "client_id";
    const channel = supabase
      .channel(`inbox-unread-${profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `${filterColumn}=eq.${profileId}` },
        (payload) => {
          const row = payload.new as { thread_id: string; sender_id: string };
          if (row.sender_id === profileId) return;
          setUnreadMap((prev) => ({ ...prev, [row.thread_id]: true }));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_threads", filter: `${filterColumn}=eq.${profileId}` },
        (payload) => {
          const row = payload.new as ChatThreadRow;
          setUnreadMap((prev) => ({ ...prev, [row.id]: isThreadUnread(row, role) }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, role, profileId]);

  const unread = Object.values(unreadMap).some(Boolean);

  return (
    <Link href={href} className="relative hover:text-ink-primary">
      Inbox
      {unread && (
        <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-yellow-400" aria-label="Unread messages" />
      )}
    </Link>
  );
}
