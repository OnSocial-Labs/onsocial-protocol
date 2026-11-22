// ---------------------------------------------------------------------------
// builders/post — post / reply / quote payloads + media resolution
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { MediaRef } from '../schema/v1.js';
import type { PostData } from '../types.js';
import type { StorageProvider } from '../storage/provider.js';
import { probeBlobDimensions } from '../internal/media-dimensions.js';
import { captureBlobVideoPoster } from '../internal/media-poster.js';
import { videoMimeForBlob } from '../internal/video-mime.js';
import { acceptedPosterCid } from '../internal/poster-cid.js';
import {
  omitPostersOverStorageBudget,
  personalPostStorageKey,
} from '../internal/post-storage-budget.js';
import { applyFeedMeta, type SocialSetData } from './_shared.js';

function sealPersonalPost(
  postId: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  return omitPostersOverStorageBudget(value, personalPostStorageKey(postId));
}

export function buildPostSetData(
  post: PostData,
  postId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${postId}`]: sealPersonalPost(postId, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      timestamp: post.timestamp ?? now,
    }),
  };
}

/**
 * Build a reply post. The `parent` and `parentType` fields are picked up
 * by the substreams indexer and exposed via the `thread_replies` view.
 *
 * @param parentAuthor - account that owns the parent post
 * @param parentId     - id of the parent post (the part after `post/`)
 * @param post         - reply content
 * @param replyId      - id for the new reply
 * @param now          - timestamp override (defaults to Date.now())
 */
export function buildReplySetData(
  parentAuthor: string,
  parentId: string,
  post: PostData,
  replyId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${replyId}`]: sealPersonalPost(replyId, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      parent: `${parentAuthor}/post/${parentId}`,
      parentType: 'post',
      timestamp: post.timestamp ?? now,
    }),
  };
}

/**
 * Build a quote post (comment + reference).
 * The `ref` and `refType` fields are picked up by the substreams indexer
 * and exposed via the `quotes` / `quote_counts` views.
 */
export function buildQuoteSetData(
  refAuthor: string,
  refPath: string,
  post: PostData,
  quoteId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${quoteId}`]: sealPersonalPost(quoteId, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      ref: `${refAuthor}/${refPath}`,
      refType: 'quote',
      timestamp: post.timestamp ?? now,
    }),
  };
}

/**
 * Build a repost (share without required commentary).
 * Indexed via `reposts` / `repost_counts` (`refType: 'repost'`).
 */
export function buildRepostSetData(
  refAuthor: string,
  refPath: string,
  post: PostData,
  repostId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${repostId}`]: sealPersonalPost(repostId, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta({ ...post, text: post.text ?? '' }),
      ref: `${refAuthor}/${refPath}`,
      refType: 'repost',
      timestamp: post.timestamp ?? now,
    }),
  };
}

function withAcceptedPoster(entry: string | MediaRef): string | MediaRef {
  if (typeof entry !== 'object' || entry === null || !('poster' in entry)) {
    return entry;
  }
  const raw = entry.poster;
  if (raw === undefined) return entry;
  const poster = typeof raw === 'string' ? acceptedPosterCid(raw) : null;
  if (!poster) {
    const { poster: _drop, ...rest } = entry;
    return rest;
  }
  return poster === raw ? entry : { ...entry, poster };
}

export function isFileLike(value: unknown): value is Blob | File {
  return (
    (typeof File !== 'undefined' && value instanceof File) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  );
}

/**
 * Resolve the `image` / `files` convenience fields on `PostData` into a
 * materialised `media[]` array. The returned PostData no longer carries
 * `image` or `files`; all uploads have been performed via the supplied
 * StorageProvider.
 *
 * In browser runtimes each `files` entry is also probed for intrinsic
 * dimensions (image natural size / video metadata) so the stored MediaRef
 * carries `width` / `height` renderer hints. Video files additionally get a
 * best-effort JPEG `poster` CID for feed stand-ins. Probing / poster capture
 * never blocks or fails the write — non-browser runtimes simply omit them.
 *
 * Exported so callers that don't go through `SocialModule` (e.g. custom
 * flows, contract-direct devs) can reuse the same media-resolution rules.
 */
export async function resolvePostMedia(
  post: PostData,
  storage: StorageProvider
): Promise<PostData> {
  const hasImage = isFileLike(post.image);
  const hasFiles =
    Array.isArray(post.files) && (post.files as unknown[]).length > 0;
  if (!hasImage && !hasFiles) return post;

  const { image: _dropImage, files: _dropFiles, ...rest } = post;
  const existing = ((post.media ?? []) as Array<string | MediaRef>).map(
    withAcceptedPoster
  );
  const prepended: Array<string | MediaRef> = [];

  if (hasImage && post.image) {
    const uploaded = await storage.upload(post.image);
    prepended.push(`ipfs://${uploaded.cid}`);
  }
  if (hasFiles && post.files) {
    const uploads = await Promise.all(
      (post.files as Array<Blob | File>).map(async (f) => {
        const declared = typeof f.type === 'string' && f.type ? f.type : '';
        const videoMime = videoMimeForBlob(f);
        const [u, dims, posterBlob] = await Promise.all([
          storage.upload(f),
          probeBlobDimensions(f, videoMime ?? declared),
          videoMime ? captureBlobVideoPoster(f) : Promise.resolve(null),
        ]);
        let poster: string | undefined;
        if (posterBlob) {
          try {
            const still = await storage.upload(posterBlob);
            const accepted = acceptedPosterCid(still.cid ?? '');
            if (accepted) poster = accepted;
          } catch {
            // Poster is optional — keep the video ref without it.
          }
        }
        return { u, dims, poster };
      })
    );
    for (const { u, dims, poster } of uploads) {
      prepended.push({
        cid: u.cid,
        mime: u.mime,
        size: u.size,
        ...dims,
        ...(poster ? { poster } : {}),
      });
    }
  }

  return { ...rest, media: [...prepended, ...existing] };
}
