"use client";

import { useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const INTRO: ChatMessage = {
  role: "assistant",
  content:
    "I'm not wired up to an LLM yet — see app/api/chat/route.ts to plug one in. Once " +
    "connected, I'll be able to read your synced Health Connect data and talk through " +
    "training, recovery, and trends with you.",
};

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong reaching the coach endpoint." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-[color:var(--border-hairline)] bg-surface">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-[color:var(--series-steps)] text-white"
                : "bg-[color:var(--page-plane)] text-ink-primary"
            }`}
          >
            {m.content}
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-[color:var(--border-hairline)] p-3">
        <input
          className="flex-1 rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
          placeholder="Ask your coach…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          disabled={sending}
        />
        <button
          onClick={sendMessage}
          disabled={sending}
          className="rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
