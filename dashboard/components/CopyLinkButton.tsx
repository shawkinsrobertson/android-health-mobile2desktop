"use client";

import { useState } from "react";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context)
      // -- the URL is already shown as text, so this is just a convenience.
    }
  }

  return (
    <button
      onClick={copy}
      className="shrink-0 rounded-md border border-[color:var(--border-hairline)] px-2 py-1 text-xs text-ink-secondary hover:text-ink-primary"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
