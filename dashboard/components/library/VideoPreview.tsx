import { getYouTubeEmbedUrl } from "@/lib/media";

// Renders a resolved video slot -- a real <video> tag for an uploaded file
// or a direct video-file URL, or a YouTube <iframe> embed when the source
// is a YouTube watch/shorts/share link (a <video> tag can't play those; a
// plain <video src="https://youtube.com/watch?v=..."> just shows an empty
// player with no video, which is the bug this replaces).
//
// `path`/`url` are the RAW columns (e.g. exercise.video_path/video_url),
// used only to tell "is this an external YouTube link" apart from "is this
// an uploaded file" -- an uploaded file is always a real video and never
// needs the YouTube check. `resolvedUrl` is what actually gets played
// (from lib/media.ts's resolveMediaUrl/resolveMediaPair).
export function VideoPreview({
  path,
  url,
  resolvedUrl,
  className,
}: {
  path: string | null | undefined;
  url: string | null | undefined;
  resolvedUrl: string | null | undefined;
  className?: string;
}) {
  if (!resolvedUrl) return null;

  const youTubeEmbedUrl = !path && url ? getYouTubeEmbedUrl(url) : null;

  if (youTubeEmbedUrl) {
    return (
      <iframe
        src={youTubeEmbedUrl}
        title="Video preview"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className={
          className ??
          "aspect-video w-full max-w-md rounded-lg border border-[color:var(--border-hairline)]"
        }
      />
    );
  }

  return (
    <video
      src={resolvedUrl}
      controls
      className={
        className ?? "max-h-60 w-fit rounded-lg border border-[color:var(--border-hairline)]"
      }
    />
  );
}
