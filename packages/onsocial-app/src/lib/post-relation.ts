import { postContentPath, type PostRow } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';
import { postKey } from '@/lib/post-display';

export function isRepostRefType(refType: string | undefined): boolean {
  return (refType ?? '').trim().toLowerCase() === 'repost';
}

export function isQuoteRefType(refType: string | undefined): boolean {
  const key = (refType ?? '').trim().toLowerCase();
  return key === 'quote' || key === 'cite';
}

export type PostRelationContext =
  | { kind: 'reply' | 'quote'; verb: string; handle: string }
  | { kind: 'repost'; label: string };

/** Reply / quote fallback / share attribution — muted context line. */
export function postRelationContext(
  post: {
    accountId?: string;
    parentPath?: string;
    parentAuthor?: string;
    refPath?: string;
    refAuthor?: string;
    refType?: string;
  },
  hasQuoteInset: boolean,
  opts?: {
    viewerAccountId?: string | null;
    authorName?: string | null;
  }
): PostRelationContext | null {
  if (post.parentPath) {
    const handle = post.parentAuthor ?? post.parentPath.split('/')[0];
    return handle ? { kind: 'reply', verb: 'Replying to', handle } : null;
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
  // Quote inset already shows the original — only label when it's missing.
  if (post.refPath && !hasQuoteInset) {
    const handle = post.refAuthor ?? post.refPath.split('/')[0];
    return handle ? { kind: 'quote', verb: 'Quoting', handle } : null;
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
