/**
 * Audio limits for Music drops (Single / Album) on create-drop.
 */

export const DROP_AUDIO_MAX_BYTES = 20 * 1024 * 1024;
export const DROP_AUDIO_MAX_TRACKS = 30;

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

export type MusicReleaseFormat = 'single' | 'album';

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
  return count >= 2 && count <= DROP_AUDIO_MAX_TRACKS;
}
