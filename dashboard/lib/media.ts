import type { SupabaseClient } from "@supabase/supabase-js";

// Shared helpers for the `library-media` Storage bucket (see
// supabase/migrations/0004_libraries.sql). Every media-bearing table
// (library_exercises, library_workouts, library_programs, library_documents,
// and their assigned_* snapshots) stores a `*_path` (Storage object) and/or
// a `*_url` (external link) column per media slot -- either, both, or
// neither may be set. The bucket is private, so a path is never rendered
// directly: it always goes through a signed URL minted per-request.

export const LIBRARY_MEDIA_BUCKET = "library-media";

export type MediaKind = "exercises" | "workouts" | "programs" | "documents" | "responses";

// Builds the {coach_id}/{kind}/{uuid}-{filename} path convention every
// Storage RLS policy in 0004/0005 assumes. `extra` lets the responses kind
// nest under {assigned_document_id} (see submitDocumentResponse).
export function mediaPathFor(
  coachId: string,
  kind: MediaKind,
  filename: string,
  extra?: string,
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = crypto.randomUUID();
  const segments = [coachId, kind, ...(extra ? [extra] : []), `${unique}-${safeName}`];
  return segments.join("/");
}

// Uploads a File to the shared bucket at a freshly-generated path. Never
// overwrites an existing object in place -- see the migration's comment on
// why old objects are left alone on replace (an already-assigned client's
// frozen row may still point at the old path).
export async function uploadMedia(
  supabase: SupabaseClient,
  coachId: string,
  kind: MediaKind,
  file: File,
  extra?: string,
): Promise<string> {
  const path = mediaPathFor(coachId, kind, file.name, extra);
  const { error } = await supabase.storage.from(LIBRARY_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

// Resolves whatever's in a media slot to a URL the browser can load: a
// signed URL if a Storage path is set (upload takes precedence when both
// are present), else the external URL, else null.
export async function resolveMediaUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  url: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (path) {
    const { data, error } = await supabase.storage
      .from(LIBRARY_MEDIA_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (!error && data?.signedUrl) return data.signedUrl;
    // Fall through to the external URL, if any, rather than failing the
    // whole page over a stale/missing object.
  }
  return url ?? null;
}

// Convenience for resolving a photo+video pair together (the common case
// on every library/assigned page).
export async function resolveMediaPair(
  supabase: SupabaseClient,
  row: {
    photo_path?: string | null;
    photo_url?: string | null;
    video_path?: string | null;
    video_url?: string | null;
  },
): Promise<{ photoUrl: string | null; videoUrl: string | null }> {
  const [photoUrl, videoUrl] = await Promise.all([
    resolveMediaUrl(supabase, row.photo_path, row.photo_url),
    resolveMediaUrl(supabase, row.video_path, row.video_url),
  ]);
  return { photoUrl, videoUrl };
}

// True if a File was actually chosen in a form submission (an empty file
// input still comes through FormData as a zero-byte, empty-name File).
export function hasFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

// One media slot's raw form input -- see components/library/MediaUploadField.tsx,
// which renders the three inputs this reads: `${prefix}_file`, `${prefix}_url`,
// and `${prefix}_remove` (a "remove the uploaded file" checkbox, only shown
// when a file is already on record).
export interface MediaFieldInput {
  file: File | null;
  url: string | null; // trimmed, or null if left blank
  remove: boolean;
}

export function readMediaField(formData: FormData, prefix: string): MediaFieldInput {
  const fileValue = formData.get(`${prefix}_file`);
  const urlValue = formData.get(`${prefix}_url`);
  const removeValue = formData.get(`${prefix}_remove`);
  return {
    file: hasFile(fileValue) ? fileValue : null,
    url: typeof urlValue === "string" && urlValue.trim() ? urlValue.trim() : null,
    remove: removeValue === "on",
  };
}

// Turns a MediaFieldInput into the {path, url} pair to write: uploads a new
// file if one was chosen (replacing the stored path), clears the path if
// "remove" was checked, otherwise leaves the existing path untouched. The
// url column always takes whatever's in the url input, independent of the
// file -- both slots are meant to coexist per the product decision that
// media supports upload AND an external link.
export async function applyMediaField(
  supabase: SupabaseClient,
  coachId: string,
  kind: MediaKind,
  input: MediaFieldInput,
  existingPath: string | null | undefined,
  extra?: string,
): Promise<{ path: string | null; url: string | null }> {
  let path = existingPath ?? null;
  if (input.file) {
    path = await uploadMedia(supabase, coachId, kind, input.file, extra);
  } else if (input.remove) {
    path = null;
  }
  return { path, url: input.url };
}
