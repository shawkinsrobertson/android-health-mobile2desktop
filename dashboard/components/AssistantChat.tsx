"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Same markdown rendering as the deleted global coach chat (ChatPanel.tsx,
// recovered via `git show b9a5656:dashboard/components/ChatPanel.tsx`) --
// still the right styling for this app's tokens.
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-[color:var(--series-steps)]"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-base font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-[color:var(--border-hairline)] pl-3 text-ink-secondary last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = Boolean(className);
    return isBlock ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-[color:var(--surface-1)] px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-[color:var(--surface-1)] p-2 font-mono text-[0.85em] last:mb-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-2 border-[color:var(--border-hairline)]" />,
};

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

const INTRO: ChatMessage = {
  role: "assistant",
  content:
    "Ask me about this client's steps, sleep, heart rate, workouts, personal records, or " +
    "calendar availability -- I'll pull from their synced data and your notes to answer.",
};

// Everything this component displays came back through
// /api/clients/[clientId]/assistant, which never sends the model any
// identifying detail about the client -- see lib/assistant-tools.ts.
export function AssistantChat({
  clientId,
  initialMessages,
}: {
  clientId: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages.length ? initialMessages : [INTRO]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function replaceLastAssistant(update: (prev: string) => string) {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = { role: "assistant", content: update(last?.content ?? "") };
      return updated;
    });
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);
    setError(null);
    setStatus(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.trim()) continue;

          const event = JSON.parse(line) as
            | { type: "text"; text: string }
            | { type: "tool_use"; name: string }
            | { type: "done" }
            | { type: "error"; message: string };

          if (event.type === "text") {
            setStatus(null);
            replaceLastAssistant((prev) => prev + event.text);
          } else if (event.type === "tool_use") {
            setStatus("Checking " + event.name.replace(/^get_/, "").replace(/_/g, " ") + "…");
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStatus(null);
      setSending(false);
    }
  }

  return (
    <div className="flex h-[60vh] flex-col rounded-lg border border-[color:var(--border-hairline)]">
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {messages.map((message, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 ${
              message.role === "user"
                ? "ml-auto bg-[color:var(--series-steps)] text-white"
                : "bg-[color:var(--page-plane)] text-ink-primary"
            }`}
          >
            {message.role === "assistant" ? (
              message.content ? (
                <MarkdownMessage content={message.content} />
              ) : (
                <span className="text-ink-muted">{status ?? "Thinking…"}</span>
              )
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="border-t border-[color:var(--border-hairline)] px-4 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="flex gap-2 border-t border-[color:var(--border-hairline)] p-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this client's data…"
          disabled={sending}
          className="flex-1 rounded-md border border-[color:var(--border-hairline)] bg-transparent px-3 py-1.5 text-sm text-ink-primary"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-md bg-[color:var(--series-steps)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
