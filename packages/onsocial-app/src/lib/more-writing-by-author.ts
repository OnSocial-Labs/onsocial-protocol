import { accountIdsEqual } from '@/lib/account-match';

/** Rows under the essay. The shelf link appears only when more remain. */
export const MORE_WRITING_ROW_LIMIT = 3;

type WritingPiece = {
  accountId: string;
  postId: string;
};

/**
 * Other pieces by this author, in the order given (newest first from
 * `feed.recent`). The open piece is skipped. A different account never matches.
 */
export function moreWritingByAuthor<T extends WritingPiece>(
  articles: readonly T[],
  current: WritingPiece,
  limit = MORE_WRITING_ROW_LIMIT
): { items: T[]; hasMore: boolean } {
  const others: T[] = [];
  for (const post of articles) {
    if (!accountIdsEqual(post.accountId, current.accountId)) continue;
    if (post.postId === current.postId) continue;
    others.push(post);
  }
  const cap = Math.max(0, limit);
  return {
    items: others.slice(0, cap),
    hasMore: others.length > cap,
  };
}
