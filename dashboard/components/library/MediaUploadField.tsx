// One media slot (photo or video): an uploaded file and/or an external
// URL, either of which may be set independently -- see lib/media.ts for
// how a submitted form is turned back into a {path, url} pair. Plain
// server-rendered markup; no interactivity beyond the native inputs, so no
// "use client" boundary needed.

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

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-[color:var(--border-hairline)] p-3">
      <legend className="px-1 text-xs font-medium text-ink-secondary">{label}</legend>

      {previewUrl &&
        (kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Current ${label.toLowerCase()}`}
            className="max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)] object-cover"
          />
        ) : kind === "video" ? (
          <video
            src={previewUrl}
            controls
            className="max-h-40 w-fit rounded-md border border-[color:var(--border-hairline)]"
          />
        ) : (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm text-[color:var(--series-steps)] underline"
          >
            View current file
          </a>
        ))}

      <label className="flex flex-col gap-1 text-sm text-ink-primary">
        Upload a file
        <input
          type="file"
          name={`${prefix}_file`}
          accept={accept}
          className="text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--page-plane)] file:px-3 file:py-1.5 file:text-xs file:text-ink-primary"
        />
      </label>

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
