// ---------------------------------------------------------------------------
// builders/post — post / reply / quote payloads + media resolution
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { MediaRef } from '../schema/v1.js';
import type { PostData } from '../types.js';
import type { StorageProvider } from '../storage/provider.js';
import { applyFeedMeta, type SocialSetData } from './_shared.js';

export function buildPostSetData(
  post: PostData,
  postId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${postId}`]: {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      timestamp: post.timestamp ?? now,
    },
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
    [`post/${replyId}`]: {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      parent: `${parentAuthor}/post/${parentId}`,
      parentType: 'post',
      timestamp: post.timestamp ?? now,
    },
  };
}

/**
 * Build a quote post (the OnSocial equivalent of a repost / quote-tweet).
 * The `ref` and `refType` fields are picked up by the substreams indexer
 * and exposed via the `quotes` view.
 */
export function buildQuoteSetData(
  refAuthor: string,
  refPath: string,
  post: PostData,
  quoteId: string,
  now = Date.now()
): SocialSetData {
  return {
    [`post/${quoteId}`]: {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      ref: `${refAuthor}/${refPath}`,
      refType: 'quote',
      timestamp: post.timestamp ?? now,
    },
  };
}

export function isFileLike(value: unknown): value is Blob | File {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

/**
 * Resolve the `image` / `files` convenience fields on `PostData` into a
 * materialised `media[]` array. The returned PostData no longer carries
 * `image` or `files`; all uploads have been performed via the supplied
 * StorageProvider.
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
  const existing = (post.media ?? []) as Array<string | MediaRef>;
  const prepended: Array<string | MediaRef> = [];

  if (hasImage && post.image) {
    const uploaded = await storage.upload(post.image);
    prepended.push(`ipfs://${uploaded.cid}`);
  }
  if (hasFiles && post.files) {
    const uploads = await Promise.all(
      (post.files as Array<Blob | File>).map((f) => storage.upload(f))
    );
    for (const u of uploads) {
      prepended.push({ cid: u.cid, mime: u.mime, size: u.size });
    }
  }

  return { ...rest, media: [...prepended, ...existing] };
}
