"use client";

import { useEffect, useRef, type RefObject } from "react";

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
  triggerRef,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  palette?: string[];
  // The button that opens/toggles this picker -- excluded from the
  // outside-tap check below so tapping it again to close doesn't race
  // with its own onClick toggle (pointerdown closing it, then the click
  // that follows immediately reopening it -- see Composer.tsx/MessageBubble.tsx).
  triggerRef?: RefObject<HTMLElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: PointerEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    }
    // pointerdown (not mousedown/click) fires consistently for both touch
    // and mouse, and fires before the trigger button's own onClick.
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [onClose, triggerRef]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full z-20 mb-1 flex w-64 flex-wrap gap-1 rounded-lg border border-[color:var(--border-hairline)] bg-surface p-2 shadow-lg"
    >
      {palette.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded text-xl leading-none hover:bg-[color:var(--page-plane)]"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
