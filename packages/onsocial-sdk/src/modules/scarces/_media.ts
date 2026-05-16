// ---------------------------------------------------------------------------
// Internal helper: turn an `image: File` (or pre-computed `mediaCid`) into
// a resolved `{ mediaCid, mediaHash? }` pair, uploading via the configured
// `StorageProvider` when needed.
//
// Mirrors `resolvePostMedia` in the posts pipeline: the dev never has to
// think about Lighthouse — they pass `image: file`, the module decides.
//
// Behaviour:
//   • If `mediaCid` already present → compose through the gateway so it can
//     hash the existing CID bytes when `mediaHash` is not provided.
//   • If `image` is a Blob/File and a StorageProvider is configured →
//     upload, return `{ mediaCid: uploaded.cid, mediaHash: sha256(image) }`.
//   • If neither → returns empty object (caller may still hit the
//     `/compose/<verb>` fallback path which uploads server-side).
// ---------------------------------------------------------------------------

import type { StorageProvider } from '../../storage/provider.js';
import { isFileLike } from '../../builders/post.js';

export interface MediaResolveInput {
  image?: Blob | File;
  mediaCid?: string;
  mediaHash?: string;
}

export interface ResolvedMedia {
  mediaCid?: string;
  mediaHash?: string;
}

export async function resolveScarceMedia(
  opts: MediaResolveInput,
  storage: StorageProvider | undefined
): Promise<ResolvedMedia> {
  if (opts.mediaCid) {
    return {
      mediaCid: opts.mediaCid,
      ...(opts.mediaHash ? { mediaHash: opts.mediaHash } : {}),
    };
  }
  if (storage && isFileLike(opts.image) && opts.image) {
    const uploaded = await storage.upload(opts.image);
    return {
      mediaCid: uploaded.cid,
      mediaHash: opts.mediaHash ?? (await sha256BlobBase64(opts.image)),
    };
  }
  return opts.mediaHash ? { mediaHash: opts.mediaHash } : {};
}

/** Are we able to bypass the gateway and upload locally? */
export function hasLocalUpload(
  storage: StorageProvider | undefined,
  image: unknown,
  mediaCid?: string
): boolean {
  return !mediaCid && !!storage && isFileLike(image);
}

async function sha256BlobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const digest = await sha256(bytes);
  return bytesToBase64(digest);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.subtle &&
    typeof globalThis.crypto.subtle.digest === 'function'
  ) {
    const view = new Uint8Array(data.byteLength);
    view.set(data);
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', view);
    return new Uint8Array(buffer);
  }
  const nodeCrypto = await import('node:crypto');
  return new Uint8Array(nodeCrypto.createHash('sha256').update(data).digest());
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let byteIndex = 0; byteIndex < bytes.byteLength; byteIndex++) {
    binary += String.fromCharCode(bytes[byteIndex]);
  }
  return btoa(binary);
}
