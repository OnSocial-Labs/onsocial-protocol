import type { PostRow } from '@onsocial/sdk';
import { hasQuotedPostCacheEntry } from '@/hooks/use-quoted-posts';
import { parsePostText } from '@/lib/post-display';
import { isRepostRefType } from '@/lib/post-relation';

/** Empty repost shell — feed paints the original once `refPath` resolves. */
export function isBareRepostShell(
  post: Pick<PostRow, 'refType' | 'value' | 'refPath'>
): boolean {
  return (
    isRepostRefType(post.refType) &&
    !parsePostText(post.value).trim() &&
    Boolean(post.refPath?.trim())
  );
}

export type ResolvedFeedRepostCard = {
  /** Hold a skeleton seat until the original lands. */
  pending: boolean;
  card: PostRow;
  quoted: PostRow | undefined;
  repostedBy?: { accountId: string; displayName?: string | null };
};

/**
 * Bare repost → original as the card + attribution. Quote refs keep the
 * citing card and put the original in the inset. Shared by feed + thread.
 */
export function resolveFeedRepostCard(
  post: PostRow,
  quotedPosts: Record<string, PostRow>,
  profiles?: Record<string, { displayName?: string | null }>
): ResolvedFeedRepostCard {
  const rawQuoted = post.refPath ? quotedPosts[post.refPath] : undefined;
  if (isBareRepostShell(post)) {
    const path = post.refPath!.trim();
    if (!rawQuoted && !hasQuotedPostCacheEntry(path)) {
      return { pending: true, card: post, quoted: undefined };
    }
    if (rawQuoted) {
      return {
        pending: false,
        card: rawQuoted,
        quoted: rawQuoted.refPath
          ? quotedPosts[rawQuoted.refPath]
          : undefined,
        repostedBy: {
          accountId: post.accountId,
          displayName: profiles?.[post.accountId]?.displayName,
        },
      };
    }
  }
  return {
    pending: false,
    card: post,
    quoted: rawQuoted,
  };
}
