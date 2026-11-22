// ---------------------------------------------------------------------------
// builders/group-post — group post / reply / quote payloads + path
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { GroupPostRef, PostData } from '../types.js';
import { omitPostersOverStorageBudget } from '../internal/post-storage-budget.js';
import { applyFeedMeta, type SocialSetData } from './_shared.js';

function sealGroupPost(
  storageKey: string,
  value: Record<string, unknown>
): Record<string, unknown> {
  return omitPostersOverStorageBudget(value, storageKey);
}

/**
 * Build a post written into a group's content namespace. The contract stores
 * it under `groups/<groupId>/content/post/<postId>` — the `content/` segment
 * is required so default member write permissions (granted on the `content`
 * subpath at join time) authorize the write.
 *
 * Note: the enclosing `Set` action must target the group's owning account
 * (group owner) or be sent by a member with permission on `content`.
 */
export function buildGroupPostSetData(
  groupId: string,
  post: PostData,
  postId: string,
  now = Date.now()
): SocialSetData {
  const path = `groups/${groupId}/content/post/${postId}`;
  return {
    [path]: sealGroupPost(path, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      timestamp: post.timestamp ?? now,
    }),
  };
}

export function buildGroupPostPath(post: GroupPostRef): string {
  return `${post.author}/groups/${post.groupId}/content/post/${post.postId}`;
}

export function buildGroupReplySetData(
  groupId: string,
  parentPath: string,
  post: PostData,
  replyId: string,
  now = Date.now()
): SocialSetData {
  const path = `groups/${groupId}/content/post/${replyId}`;
  return {
    [path]: sealGroupPost(path, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      parent: parentPath,
      parentType: 'post',
      timestamp: post.timestamp ?? now,
    }),
  };
}

export function buildGroupQuoteSetData(
  groupId: string,
  refPath: string,
  post: PostData,
  quoteId: string,
  now = Date.now()
): SocialSetData {
  const [refAuthor] = refPath.split('/', 1);
  const path = `groups/${groupId}/content/post/${quoteId}`;
  return {
    [path]: sealGroupPost(path, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta(post),
      ref: refPath,
      ...(refAuthor ? { refAuthor } : {}),
      refType: 'quote',
      timestamp: post.timestamp ?? now,
    }),
  };
}

export function buildGroupRepostSetData(
  groupId: string,
  refPath: string,
  post: PostData,
  repostId: string,
  now = Date.now()
): SocialSetData {
  const [refAuthor] = refPath.split('/', 1);
  const path = `groups/${groupId}/content/post/${repostId}`;
  return {
    [path]: sealGroupPost(path, {
      v: SCHEMA_VERSION,
      ...applyFeedMeta({ ...post, text: post.text ?? '' }),
      ref: refPath,
      ...(refAuthor ? { refAuthor } : {}),
      refType: 'repost',
      timestamp: post.timestamp ?? now,
    }),
  };
}
