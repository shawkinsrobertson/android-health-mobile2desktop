"use client";

import { useRef, useState, useTransition } from "react";
import { EmojiPicker } from "./EmojiPicker";
import type { ChatMessageRow } from "@/lib/chat";

export function Composer({
  replyTo,
  onCancelReply,
  onSend,
}: {
  replyTo: ChatMessageRow | null;
  onCancelReply: () => void;
  onSend: (formData: FormData) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed && !pendingFile) return;

    const formData = new FormData();
    if (trimmed) formData.set("body", trimmed);
    if (replyTo) formData.set("reply_to_id", replyTo.id);
    if (pendingFile) formData.set("attachment", pendingFile);

    startTransition(async () => {
      await onSend(formData);
      setText("");
      setPendingFile(null);
      onCancelReply();
    });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recordStartRef.current = Date.now();
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const durationSeconds = Math.round((Date.now() - recordStartRef.current) / 1000);
        const file = new File([blob], `voice-message-${Date.now()}.webm`, { type: "audio/webm" });
        setPendingFile(file);
        stream.getTracks().forEach((t) => t.stop());

        const formData = new FormData();
        formData.set("attachment", file);
        formData.set("attachment_duration_seconds", String(durationSeconds));
        if (replyTo) formData.set("reply_to_id", replyTo.id);
        startTransition(async () => {
          await onSend(formData);
          setPendingFile(null);
          onCancelReply();
        });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      alert("Couldn't access the microphone.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="border-t border-[color:var(--border-hairline)] p-3">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-[color:var(--page-plane)] px-2 py-1 text-xs text-ink-secondary">
          <span className="truncate">
            Replying to: {replyTo.body || (replyTo.attachment_kind ? `[${replyTo.attachment_kind}]` : "")}
          </span>
          <button type="button" onClick={onCancelReply} className="ml-2 text-ink-muted hover:text-ink-primary">
            ✕
          </button>
        </div>
      )}
      {pendingFile && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-[color:var(--page-plane)] px-2 py-1 text-xs text-ink-secondary">
          <span className="truncate">Attached: {pendingFile.name}</span>
          <button
            type="button"
            onClick={() => setPendingFile(null)}
            className="ml-2 text-ink-muted hover:text-ink-primary"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-md border border-[color:var(--border-hairline)] px-2 py-2 text-sm"
          >
            😊
          </button>
          {pickerOpen && (
            <EmojiPicker onSelect={(emoji) => setText((t) => t + emoji)} onClose={() => setPickerOpen(false)} />
          )}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-[color:var(--border-hairline)] px-2 py-2 text-sm"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPendingFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`rounded-md border px-2 py-2 text-sm ${
            recording
              ? "border-red-500 text-red-600 dark:text-red-400"
              : "border-[color:var(--border-hairline)]"
          }`}
        >
          {recording ? "⏹" : "🎙️"}
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message…"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm text-ink-primary outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isPending || (!text.trim() && !pendingFile)}
          className="rounded-lg bg-[color:var(--series-steps)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
