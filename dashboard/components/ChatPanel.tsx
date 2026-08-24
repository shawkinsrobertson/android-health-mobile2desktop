"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Assistant replies come back as markdown (the system prompt asks Claude to
// use it for structure). Render it instead of dumping raw "**bold**"/"##"
// syntax as text; user messages stay plain since they're just what was typed.
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
    // remark-gfm/react-markdown only sets a `language-*` className on the
    // <code> inside a fenced block, so its absence means an inline `code` span.
    const isBlock = Boolean(className);
    return isBlock ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-[color:var(--surface-1)] px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
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
    "Hey — I'm your assistant coach, grounded in your client's synced Health Connect data " +
    "(steps, heart rate, sleep, exercise). Ask me about trends, recovery, or how " +
    "training's going.",
};

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  function replaceLastAssistant(content: string) {
    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: "assistant", content };
      return updated;
    });
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Request failed (${res.status})`);
      }

      // The API route streams plain text chunks as Claude generates them —
      // append each chunk to the in-progress assistant message as it arrives.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        replaceLastAssistant(assistantText);
      }
    } catch (err) {
      replaceLastAssistant(
        "Something went wrong reaching the coach" +
          (err instanceof Error ? `: ${err.message}` : "."),
      );
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
            {m.role === "assistant" ? <MarkdownMessage content={m.content} /> : m.content}
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
