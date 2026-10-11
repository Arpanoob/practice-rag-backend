const YOUTUBE_ID_REGEX =
  /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/;

const BARE_ID_REGEX = /^[\w-]{11}$/;

/**
 * Extracts the 11-character YouTube video ID from a URL or bare ID.
 * Returns null if the input is not a recognizable YouTube reference.
 */
export function extractVideoId(videoUrl: string): string | null {
  if (!videoUrl) return null;
  const trimmed = videoUrl.trim();
  if (BARE_ID_REGEX.test(trimmed)) return trimmed;
  const match = trimmed.match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

/** True when the input resolves to a valid YouTube video reference. */
export function isValidYouTubeUrl(videoUrl: string): boolean {
  return extractVideoId(videoUrl) !== null;
}
