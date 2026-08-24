import { postContentPath, type PostRow } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';
import { postKey } from '@/lib/post-display';
import {
  customDisplayName,
  fallbackLabel,
} from '@/lib/profile-display';

export function isRepostRefType(refType: string | undefined): boolean {
  return (refType ?? '').trim().toLowerCase() === 'repost';
}

export function isQuoteRefType(refType: string | undefined): boolean {
  const key = (refType ?? '').trim().toLowerCase();
  return key === 'quote' || key === 'cite';
}

export type PostRelationContext =
  | { kind: 'reply'; verb: string; handle: string }
  | { kind: 'repost'; label: string };

function relationHandleFromPost(post: {
  accountId?: string;
  parentPath?: string;
  parentAuthor?: string;
}): { kind: 'reply'; handle: string } | null {
  if (!post.parentPath) return null;
  const handle = (post.parentAuthor ?? post.parentPath.split('/')[0])?.trim();
  if (!handle) return null;
  if (post.accountId && accountIdsEqual(post.accountId, handle)) return null;
  return { kind: 'reply', handle };
}

export function formatPostRelationTarget(
  accountId: string,
  profileName?: string | null
): { name: string | null; handle: string; label: string } {
  const handle = fallbackLabel(accountId);
  const name = customDisplayName(accountId, profileName);
  return {
    name: name || null,
    handle,
    label: name ? `${name} @${handle}` : `@${handle}`,
  };
}

/** Reply target account id — null for self-replies. */
export function relationTargetAccountIdFromPost(
  post: Pick<PostRow, 'accountId' | 'parentPath' | 'parentAuthor'>
): string | null {
  return relationHandleFromPost(post)?.handle ?? null;
}

export function collectRelationTargetAccountIds(
  posts: Array<Pick<PostRow, 'accountId' | 'parentPath' | 'parentAuthor'>>
): string[] {
  const ids = new Set<string>();
  for (const post of posts) {
    const targetId = relationTargetAccountIdFromPost(post);
    if (targetId) ids.add(targetId);
  }
  return [...ids];
}

/** Reply / repost attribution — muted context line. Quotes use the inset card only. */
export function postRelationContext(
  post: {
    accountId?: string;
    parentPath?: string;
    parentAuthor?: string;
    refPath?: string;
    refType?: string;
  },
  opts?: {
    viewerAccountId?: string | null;
    authorName?: string | null;
  }
): PostRelationContext | null {
  const reply = relationHandleFromPost(post);
  if (reply) {
    return {
      kind: 'reply',
      verb: 'Replying to',
      handle: reply.handle,
    };
  }
  if (isRepostRefType(post.refType) && post.refPath) {
    const viewer = opts?.viewerAccountId;
    const isYou = Boolean(
      viewer && post.accountId && accountIdsEqual(viewer, post.accountId)
    );
    const name = opts?.authorName?.trim() || post.accountId?.trim();
    return {
      kind: 'repost',
      label: isYou ? 'You reposted' : name ? `${name} reposted` : 'Reposted',
    };
  }
  return null;
}

/**
 * Feed rows swap repost shells for their originals, so engagement must be
 * fetched for those originals too. Appends resolved repost originals not
 * already in the list.
 */
export function withRepostOriginals(
  posts: PostRow[],
  quotedPosts: Record<string, PostRow>
): PostRow[] {
  const seen = new Set(posts.map(postKey));
  const extras: PostRow[] = [];
  for (const post of posts) {
    if (!isRepostRefType(post.refType) || !post.refPath) continue;
    const original = quotedPosts[post.refPath];
    if (!original || seen.has(postKey(original))) continue;
    seen.add(postKey(original));
    extras.push(original);
  }
  return extras.length > 0 ? [...posts, ...extras] : posts;
}

/**
 * Resolve the quoted original for a share card.
 * Never fall back to a thread root when `refPath` points elsewhere.
 */
export function resolveQuotedInset(
  post: Pick<PostRow, 'refPath'>,
  quotedPosts: Record<string, PostRow>,
  threadRoot?: PostRow | null
): PostRow | undefined {
  if (!post.refPath) return undefined;
  const resolved = quotedPosts[post.refPath];
  if (resolved) return resolved;
  if (threadRoot && postContentPath(threadRoot) === post.refPath) {
    return threadRoot;
  }
  return undefined;
}
