import type { MediaRef } from '@onsocial/sdk';

export function isEndorsementUploadFile(value: unknown): value is File | Blob {
  return (
    (typeof File !== 'undefined' && value instanceof File) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  );
}

export const ENDORSEMENT_VIDEO_MAX_SECONDS = 10;
export const ENDORSEMENT_VIDEO_MAX_BYTES = 3 * 1024 * 1024;
export const ENDORSEMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const ENDORSEMENT_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ENDORSEMENT_VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);

export function isEndorsementImageMime(mime: string): boolean {
  return ENDORSEMENT_IMAGE_MIMES.has(mime.toLowerCase());
}

export function isEndorsementVideoMime(mime: string): boolean {
  return ENDORSEMENT_VIDEO_MIMES.has(mime.toLowerCase());
}

export function isEndorsementMediaMime(mime: string): boolean {
  return isEndorsementImageMime(mime) || isEndorsementVideoMime(mime);
}

export function parseEndorsementMediaRef(value: unknown): MediaRef | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as MediaRef;
  if (typeof record.cid !== 'string' || !record.cid.trim()) return null;
  if (typeof record.mime !== 'string' || !record.mime.trim()) return null;
  return {
    cid: record.cid.trim(),
    mime: record.mime.trim(),
    ...(typeof record.size === 'number' ? { size: record.size } : {}),
    ...(typeof record.width === 'number' ? { width: record.width } : {}),
    ...(typeof record.height === 'number' ? { height: record.height } : {}),
    ...(typeof record.alt === 'string' ? { alt: record.alt } : {}),
  };
}

export function resolvePortalMediaUrl(
  media: MediaRef | null | undefined,
  network: 'mainnet' | 'testnet' = 'testnet'
): string | null {
  if (!media?.cid) return null;
  const base =
    network === 'mainnet'
      ? 'https://cdn.onsocial.id/ipfs'
      : 'https://cdn.testnet.onsocial.id/ipfs';
  return `${base}/${media.cid}`;
}

/** Prefer enriched mediaUrl; fall back to cid gateway URL for list cards. */
export function resolveEndorsementDisplayMediaUrl(
  item: { media?: unknown; mediaUrl?: string | null },
  network: 'mainnet' | 'testnet' = 'testnet'
): string | null {
  const direct = item.mediaUrl?.trim();
  if (direct) return direct;
  return resolvePortalMediaUrl(parseEndorsementMediaRef(item.media), network);
}

function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata.'));
    };
    video.src = url;
  });
}

export async function validateEndorsementMediaFile(
  file: File
): Promise<string | null> {
  const mime = file.type.toLowerCase();
  if (!isEndorsementMediaMime(mime)) {
    return 'Use a JPG, PNG, WebP, MP4, or WebM file.';
  }
  if (isEndorsementImageMime(mime)) {
    if (file.size > ENDORSEMENT_IMAGE_MAX_BYTES) {
      return 'Photo must be 5 MB or smaller.';
    }
    return null;
  }
  if (file.size > ENDORSEMENT_VIDEO_MAX_BYTES) {
    return 'Video must be 3 MB or smaller.';
  }
  try {
    const duration = await readVideoDurationSeconds(file);
    if (duration > ENDORSEMENT_VIDEO_MAX_SECONDS + 0.25) {
      return `Video must be ${ENDORSEMENT_VIDEO_MAX_SECONDS} seconds or shorter.`;
    }
  } catch {
    return 'Could not read that video file.';
  }
  return null;
}
