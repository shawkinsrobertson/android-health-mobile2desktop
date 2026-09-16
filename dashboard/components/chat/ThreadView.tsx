"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { sendChatMessage, toggleReaction, togglePin, markThreadRead } from "@/lib/chat-actions";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import type { ChatMessageRow, ChatReactionRow } from "@/lib/chat";

export function ThreadView({
  threadId,
  clientId,
  myProfileId,
  counterpartName,
  initialMessages,
  initialReactions,
}: {
  threadId: string;
  clientId: string;
  myProfileId: string;
  counterpartName: string;
  initialMessages: ChatMessageRow[];
  initialReactions: ChatReactionRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [reactions, setReactions] = useState(initialReactions);
  const [replyTo, setReplyTo] = useState<ChatMessageRow | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const pinned = useMemo(() => messages.filter((m) => m.pinned_at), [messages]);

  useEffect(() => {
    startTransition(() => {
      markThreadRead(threadId).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-thread-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_id !== myProfileId) {
            startTransition(() => {
              markThreadRead(threadId).catch(() => {});
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_message_reactions", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const row = payload.new as ChatReactionRow;
          setReactions((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_message_reactions", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const oldRow = payload.old as { id: string };
          setReactions((prev) => prev.filter((r) => r.id !== oldRow.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, clientId, myProfileId]);

  async function handleSend(formData: FormData) {
    const message = await sendChatMessage(threadId, formData);
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    const result = await toggleReaction(threadId, messageId, emoji);
    if (result === "removed") {
      setReactions((prev) => prev.filter((r) => !(r.message_id === messageId && r.profile_id === myProfileId && r.emoji === emoji)));
    } else {
      setReactions((prev) => [
        ...prev,
        { id: `optimistic-${messageId}-${emoji}`, message_id: messageId, profile_id: myProfileId, emoji, created_at: new Date().toISOString() },
      ]);
    }
  }

  async function handleTogglePin(messageId: string) {
    const nowPinned = await togglePin(threadId, messageId);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, pinned_at: nowPinned ? new Date().toISOString() : null, pinned_by: nowPinned ? myProfileId : null }
          : m,
      ),
    );
  }

  return (
    <div className="flex h-[75vh] flex-col rounded-xl border border-[color:var(--border-hairline)] bg-surface">
      <div className="flex items-center justify-between border-b border-[color:var(--border-hairline)] px-4 py-3">
        <h2 className="text-sm font-semibold text-ink-primary">{counterpartName}</h2>
        {pinned.length > 0 && (
          <button
            type="button"
            onClick={() => setPinnedOpen((v) => !v)}
            className="text-xs text-ink-secondary hover:text-ink-primary"
          >
            📌 {pinned.length} pinned
          </button>
        )}
      </div>

      {pinnedOpen && (
        <div className="flex flex-col gap-1 border-b border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] p-2">
          {pinned.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                setPinnedOpen(false);
              }}
              className="truncate rounded px-2 py-1 text-left text-xs text-ink-secondary hover:bg-[color:var(--border-hairline)]"
            >
              {m.body || `[${m.attachment_kind}]`}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-muted">No messages yet -- say hello.</p>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              reactions={reactions.filter((r) => r.message_id === message.id)}
              replyTo={message.reply_to_id ? (messagesById.get(message.reply_to_id) ?? null) : null}
              isMine={message.sender_id === myProfileId}
              myProfileId={myProfileId}
              supabase={supabase}
              onReply={setReplyTo}
              onToggleReaction={handleToggleReaction}
              onTogglePin={handleTogglePin}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <Composer replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={handleSend} />
    </div>
  );
}
