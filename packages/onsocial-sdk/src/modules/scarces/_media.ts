// ---------------------------------------------------------------------------
// Internal helper: turn an `image: File` (or pre-computed `mediaCid`) into
// a resolved `{ mediaCid, mediaHash? }` pair, uploading via the configured
// `StorageProvider` when needed.
//
// Mirrors `resolvePostMedia` in the posts pipeline: the dev never has to
// think about Lighthouse — they pass `image: file`, the module decides.
//
// Behaviour:
//   • If `mediaCid` already present → pass through unchanged.
//   • If `image` is a Blob/File and a StorageProvider is configured →
//     upload, return `{ mediaCid: uploaded.cid }`.
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
      ...(opts.mediaHash ? { mediaHash: opts.mediaHash } : {}),
    };
  }
  return opts.mediaHash ? { mediaHash: opts.mediaHash } : {};
}

/** Are we able to bypass the gateway and upload locally? */
export function hasLocalUpload(
  storage: StorageProvider | undefined,
  image: unknown
): boolean {
  return !!storage && isFileLike(image);
}
