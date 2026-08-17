/**
 * Audio limits for Audio drops (Single / Album / Podcast / Audiobook).
 * Discovery keeps the medium chip as "Audio"; format is chosen at create.
 *
 * Long-form (podcast / audiobook) is split into parts — episodes or chapters —
 * because each file is capped at {@link DROP_AUDIO_MAX_BYTES} (~20–25 min at
 * typical podcast bitrates). Do not ship multi-hour shows as one file.
 */

export const DROP_AUDIO_MAX_BYTES = 20 * 1024 * 1024;
export const DROP_AUDIO_MAX_TRACKS = 30;
/** Soft cap for optional per-track lyrics (plain text). */
export const DROP_LYRICS_MAX_CHARS = 8_000;

const DROP_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/x-m4a',
  'audio/m4a',
]);

export function isDropAudioMime(mime: string): boolean {
  const normalized = mime.toLowerCase();
  return DROP_AUDIO_MIMES.has(normalized) || normalized.startsWith('audio/');
}

/** "my-song_v2.mp3" → "my song v2" */
export function trackTitleFromFile(file: File): string {
  const base = file.name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base || 'Track';
}

/** Create-drop release format under the Audio medium (`extra.audioFormat`). */
export type MusicReleaseFormat =
  | 'single'
  | 'album'
  | 'podcast'
  | 'audiobook';

export type AudioPartKind = 'track' | 'episode' | 'chapter';

export function audioReleaseFormatLabel(format: MusicReleaseFormat): string {
  if (format === 'album') return 'Album';
  if (format === 'podcast') return 'Podcast';
  if (format === 'audiobook') return 'Audiobook';
  return 'Single';
}

/** Podcast → episodes; audiobook → chapters; music → tracks. */
export function audioPartKind(format: MusicReleaseFormat): AudioPartKind {
  if (format === 'podcast') return 'episode';
  if (format === 'audiobook') return 'chapter';
  return 'track';
}

export function audioPartNoun(
  format: MusicReleaseFormat,
  count: number
): string {
  const kind = audioPartKind(format);
  if (kind === 'episode') return count === 1 ? 'episode' : 'episodes';
  if (kind === 'chapter') return count === 1 ? 'chapter' : 'chapters';
  return count === 1 ? 'track' : 'tracks';
}

/** Field label above the file list (Track / Episodes / Chapters). */
export function audioPartsFieldLabel(
  format: MusicReleaseFormat,
  count: number
): string {
  const kind = audioPartKind(format);
  if (kind === 'episode') {
    return count > 0 ? `Episodes · ${count}` : 'Episodes';
  }
  if (kind === 'chapter') {
    return count > 0 ? `Chapters · ${count}` : 'Chapters';
  }
  if (format === 'single') return 'Track';
  return count > 0 ? `Tracks · ${count}` : 'Tracks';
}

/** Album / podcast / audiobook accept multiple files; single is one track. */
export function isMultiTrackAudioFormat(format: MusicReleaseFormat): boolean {
  return (
    format === 'album' || format === 'podcast' || format === 'audiobook'
  );
}

/** Base64 SHA-256 for NEP-177 `media_hash` (SDK client-build path). */
export async function sha256BlobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < hash.length; i++) {
    binary += String.fromCharCode(hash[i]!);
  }
  return btoa(binary);
}

export function musicTracksValid(
  format: MusicReleaseFormat,
  count: number
): boolean {
  if (format === 'single') return count === 1;
  // Podcast / audiobook: split long-form into episodes or chapters (1–N).
  if (format === 'podcast' || format === 'audiobook') {
    return count >= 1 && count <= DROP_AUDIO_MAX_TRACKS;
  }
  return count >= 2 && count <= DROP_AUDIO_MAX_TRACKS;
}

export function musicTracksInvalidMessage(
  format: MusicReleaseFormat
): string {
  if (format === 'single') return 'Add one track for this single.';
  if (format === 'podcast') {
    return `Add 1–${DROP_AUDIO_MAX_TRACKS} episodes for this podcast (split long shows — each file ≤20 MB).`;
  }
  if (format === 'audiobook') {
    return `Add 1–${DROP_AUDIO_MAX_TRACKS} chapters for this audiobook (split by chapter — each file ≤20 MB).`;
  }
  return `Add 2–${DROP_AUDIO_MAX_TRACKS} tracks for an album.`;
}

/** Trim and clamp lyrics for `extra.playable[].lyrics`; empty → undefined. */
export function normalizeTrackLyrics(
  raw: string | null | undefined,
  maxChars = DROP_LYRICS_MAX_CHARS
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.replace(/\r\n/g, '\n').trimEnd();
  if (!trimmed.trim()) return undefined;
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}
