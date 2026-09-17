"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveChatAttachmentUrl } from "@/lib/chat-media";
import { QUICK_REACTIONS, EmojiPicker } from "./EmojiPicker";
import type { ChatMessageRow, ChatReactionRow } from "@/lib/chat";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        URL_PATTERN.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function AttachmentView({
  message,
  supabase,
}: {
  message: ChatMessageRow;
  supabase: SupabaseClient;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (message.attachment_path) {
      resolveChatAttachmentUrl(supabase, message.attachment_path).then((resolved) => {
        if (!cancelled) setUrl(resolved);
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.attachment_path]);

  if (!message.attachment_path) return null;
  if (!url) return <div className="mt-1 h-24 w-32 animate-pulse rounded-md bg-[color:var(--page-plane)]" />;

  if (message.attachment_kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="mt-1 max-h-56 rounded-md object-cover" />;
  }
  if (message.attachment_kind === "video") {
    return <video src={url} controls className="mt-1 max-h-56 rounded-md" />;
  }
  if (message.attachment_kind === "audio") {
    return <audio src={url} controls className="mt-1 w-56" />;
  }
  return null;
}

export function MessageBubble({
  message,
  reactions,
  replyTo,
  isMine,
  supabase,
  onReply,
  onToggleReaction,
  onTogglePin,
}: {
  message: ChatMessageRow;
  reactions: ChatReactionRow[];
  replyTo: ChatMessageRow | null;
  isMine: boolean;
  myProfileId: string;
  supabase: SupabaseClient;
  onReply: (message: ChatMessageRow) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTogglePin: (messageId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactButtonRef = useRef<HTMLButtonElement>(null);

  const grouped = new Map<string, number>();
  for (const r of reactions) grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1);

  return (
    <div id={`msg-${message.id}`} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <div
        className={`relative max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isMine
            ? "bg-[color:var(--series-steps)] text-white"
            : "bg-[color:var(--page-plane)] text-ink-primary"
        }`}
      >
        {message.pinned_at && (
          <div className={`mb-1 text-[10px] ${isMine ? "text-white/80" : "text-ink-muted"}`}>📌 Pinned</div>
        )}
        {replyTo && (
          <div
            className={`mb-1 rounded border-l-2 px-2 py-1 text-xs ${
              isMine ? "border-white/50 bg-white/10 text-white/90" : "border-[color:var(--border-hairline)] bg-surface text-ink-secondary"
            }`}
          >
            {replyTo.body || (replyTo.attachment_kind ? `[${replyTo.attachment_kind}]` : "")}
          </div>
        )}
        {message.body && <Linkified text={message.body} />}
        {message.attachment_path && <AttachmentView message={message} supabase={supabase} />}
      </div>

      {grouped.size > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {[...grouped.entries()].map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggleReaction(message.id, emoji)}
              className="rounded-full border border-[color:var(--border-hairline)] bg-surface px-1.5 py-0.5 text-xs"
            >
              {emoji} {count > 1 ? count : ""}
            </button>
          ))}
        </div>
      )}

      <div className="relative mt-0.5 flex items-center gap-2 text-[10px] text-ink-muted">
        <span>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        <button type="button" onClick={() => onReply(message)} className="hover:text-ink-primary">
          Reply
        </button>
        <button
          ref={reactButtonRef}
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="hover:text-ink-primary"
        >
          React
        </button>
        <button type="button" onClick={() => onTogglePin(message.id)} className="hover:text-ink-primary">
          {message.pinned_at ? "Unpin" : "Pin"}
        </button>
        {pickerOpen && (
          <EmojiPicker
            palette={QUICK_REACTIONS}
            onSelect={(emoji) => onToggleReaction(message.id, emoji)}
            onClose={() => setPickerOpen(false)}
            triggerRef={reactButtonRef}
          />
        )}
      </div>
    </div>
  );
}
