import type { MediaRef } from '../schema/v1.js';
import type { StorageProvider } from '../storage/provider.js';

export type ProfileMediaKind = 'image' | 'video';

export interface ResolvedProfileMedia {
  kind: ProfileMediaKind;
  url: string;
  poster?: string;
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const VIDEO_MIME_PREFIX = 'video/';

function mediaKindFromMime(mime: string | undefined): ProfileMediaKind {
  if (mime?.startsWith(VIDEO_MIME_PREFIX)) {
    return 'video';
  }
  return 'image';
}

function mediaKindFromUrl(url: string): ProfileMediaKind {
  const path = url.split(/[?#]/)[0] ?? url;
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext && VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }
  return 'image';
}

function resolveStoredUrl(
  value: string,
  storage: StorageProvider
): string | null {
  if (value.startsWith('ipfs://')) {
    return storage.url(value.slice('ipfs://'.length));
  }
  return value;
}

function parseMediaRefJson(raw: string): {
  ref: MediaRef;
  poster?: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<MediaRef> & {
      poster?: string;
    };
    if (typeof parsed.cid !== 'string' || !parsed.cid.trim()) {
      return null;
    }

    const ref: MediaRef = {
      cid: parsed.cid.trim(),
      mime:
        typeof parsed.mime === 'string'
          ? parsed.mime
          : 'application/octet-stream',
      ...(typeof parsed.size === 'number' ? { size: parsed.size } : {}),
    };

    return {
      ref,
      ...(typeof parsed.poster === 'string' ? { poster: parsed.poster } : {}),
    };
  } catch {
    return null;
  }
}

/** Resolve a stored profile media field to a renderable URL + kind. */
export function resolveProfileMediaField(
  value: string | undefined,
  storage: StorageProvider
): ResolvedProfileMedia | null {
  if (!value?.trim()) {
    return null;
  }

  const raw = value.trim();
  const mediaRef = parseMediaRefJson(raw);
  if (mediaRef) {
    const url = storage.url(mediaRef.ref.cid);
    const poster =
      typeof mediaRef.poster === 'string' && mediaRef.poster.trim()
        ? (resolveStoredUrl(mediaRef.poster.trim(), storage) ?? undefined)
        : undefined;

    return {
      kind: mediaKindFromMime(mediaRef.ref.mime),
      url,
      ...(poster ? { poster } : {}),
    };
  }

  const url = resolveStoredUrl(raw, storage);
  if (!url) {
    return null;
  }

  return {
    kind: mediaKindFromUrl(url),
    url,
  };
}

/** Format an upload result for on-chain profile storage (includes mime for video). */
export function formatProfileMediaRef(uploaded: {
  cid: string;
  mime: string;
  size?: number;
}): string {
  if (uploaded.mime.startsWith(VIDEO_MIME_PREFIX)) {
    return JSON.stringify({
      cid: uploaded.cid,
      mime: uploaded.mime,
      ...(uploaded.size !== undefined ? { size: uploaded.size } : {}),
    });
  }

  return `ipfs://${uploaded.cid}`;
}
