"use client";

// One media slot (photo or video): an uploaded file and/or an external
// URL, either of which may be set independently -- see lib/media.ts for
// how a submitted form is turned back into a {path, url} pair. A video
// slot also offers "Record video" -- captures from the browser's camera
// (desktop webcam or a phone's front/back camera, whichever getUserMedia
// hands back) via MediaRecorder, then hands the recording to the exact
// same hidden file input a manual pick would use (via DataTransfer), so
// the surrounding form's existing upload path needs no changes at all.

import { useEffect, useRef, useState } from "react";
import { getYouTubeEmbedUrl } from "@/lib/media";

type MediaKind = "photo" | "video" | "file";

export function MediaUploadField({
  label,
  prefix,
  kind,
  previewUrl,
  urlValue,
  hasStoredFile,
}: {
  label: string;
  prefix: string;
  kind: MediaKind;
  previewUrl?: string | null;
  urlValue?: string | null;
  hasStoredFile?: boolean;
}) {
  const accept = kind === "photo" ? "image/*" : kind === "video" ? "video/*" : undefined;
  // An uploaded file is always a real video; only an external URL can be a
  // YouTube link needing an embed instead of a <video> tag -- see
  // components/library/VideoPreview.tsx for the read-only version of this
  // same check.
  const youTubeEmbedUrl =
    kind === "video" && !hasStoredFile && urlValue ? getYouTubeEmbedUrl(urlValue) : null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (streamPreviewRef.current) {
        streamPreviewRef.current.srcObject = stream;
        await streamPreviewRef.current.play().catch(() => {});
      }
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });
        if (fileInputRef.current) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          fileInputRef.current.files = dataTransfer.files;
        }
        setRecordedPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : "Couldn't access the camera.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-hairline)] p-3">
      <legend className="px-1 text-xs font-medium text-ink-secondary">{label}</legend>

      <video
        ref={streamPreviewRef}
        muted
        playsInline
        className={recording ? "max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)]" : "hidden"}
      />

      {recordedPreviewUrl && !recording ? (
        <video
          src={recordedPreviewUrl}
          controls
          className="max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)]"
        />
      ) : (
        previewUrl &&
        (kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Current ${label.toLowerCase()}`}
            className="max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)] object-cover"
          />
        ) : kind === "video" ? (
          youTubeEmbedUrl ? (
            <iframe
              src={youTubeEmbedUrl}
              title="Video preview"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full max-w-sm rounded-md border border-[color:var(--border-hairline)]"
            />
          ) : (
            <video
              src={previewUrl}
              controls
              className="max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)]"
            />
          )
        ) : (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm text-[color:var(--accent)] underline"
          >
            View current file
          </a>
        ))
      )}

      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Upload a file
        <input
          ref={fileInputRef}
          type="file"
          name={`${prefix}_file`}
          accept={accept}
          onChange={() => setRecordedPreviewUrl(null)}
          className="text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--page-plane)] file:px-3 file:py-1.5 file:text-xs file:text-ink-primary"
        />
      </label>

      {kind === "video" && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            className="w-fit rounded-md border border-[color:var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-ink-secondary"
          >
            {recording ? "Stop recording" : "Record video"}
          </button>
          {recordError && <p className="text-xs text-danger">{recordError}</p>}
        </div>
      )}

      {hasStoredFile && (
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" name={`${prefix}_remove`} className="rounded" />
          Remove the uploaded file
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Or link an external URL
        <input
          type="url"
          name={`${prefix}_url`}
          defaultValue={urlValue ?? ""}
          placeholder="https://..."
          className="rounded-lg border border-[color:var(--border-hairline)] bg-transparent px-3 py-2 text-sm outline-none"
        />
      </label>
      <p className="text-xs text-ink-muted">
        If both are set, the uploaded file is shown first.
      </p>
    </fieldset>
  );
}
