"use client";

import { useEffect, useRef, useState } from "react";

// Small curated palette rather than a font/library-backed emoji picker --
// keeps this dependency-free. Covers reactions + common composer use.
const EMOJI_PALETTE = [
  "👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "💪",
  "🎉", "👏", "✅", "❌", "😊", "😅", "😍", "🤔",
  "👀", "🙌", "💯", "⭐", "😴", "🤕", "🏋️", "🏃",
];

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "🔥"];

export function EmojiPicker({
  onSelect,
  onClose,
  palette = EMOJI_PALETTE,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  palette?: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full z-20 mb-1 grid grid-cols-8 gap-1 rounded-lg border border-[color:var(--border-hairline)] bg-surface p-2 shadow-lg"
    >
      {palette.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="rounded p-1 text-lg hover:bg-[color:var(--page-plane)]"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
