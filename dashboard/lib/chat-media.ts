import type { SupabaseClient } from "@supabase/supabase-js";

// Chat attachments live in their own bucket (supabase/migrations/0011_chat.sql)
// since access is two-party-per-thread rather than coach-owned like
// library-media -- see lib/media.ts for that bucket's equivalent helpers.
export const CHAT_MEDIA_BUCKET = "chat-media";

export type ChatAttachmentKind = "image" | "video" | "audio";

export function kindForMimeType(mime: string): ChatAttachmentKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export async function uploadChatAttachment(
  supabase: SupabaseClient,
  threadId: string,
  file: File,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment";
  const path = `${threadId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(`Attachment upload failed: ${error.message}`);
  return path;
}

export async function resolveChatAttachmentUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
