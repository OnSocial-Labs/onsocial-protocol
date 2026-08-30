import type { PostRow } from '@onsocial/sdk';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { postKey } from '@/lib/post-display';
import type { ThreadReplyRow } from '@/lib/thread-display';

export type ThreadReplySort = 'relevant' | 'trending' | 'recent';

export const THREAD_REPLY_SORT_OPTIONS: Array<{
  id: ThreadReplySort;
  label: string;
  description: string;
}> = [
  { id: 'relevant', label: 'Relevant', description: 'Conversation order' },
  { id: 'trending', label: 'Trending', description: 'Most engagement first' },
  { id: 'recent', label: 'Recent', description: 'Newest first' },
];

function trendingScore(
  post: PostRow,
  engagement: Record<string, PostEngagement | undefined>
): number {
  const row = engagement[postKey(post)];
  if (!row) return 0;
  return (
    (row.reactionCount ?? 0) +
    (row.replyCount ?? 0) * 2 +
    (row.quoteCount ?? 0) * 2 +
    (row.amplifyCount ?? 0) * 2
  );
}

/**
 * Reply ordering for the flow layout. `relevant` keeps the threaded tree
 * (rails + folds); ranked sorts flatten to a plain list — connectors and
 * fold buttons are tree concepts and read as noise in a ranked list.
 */
export function sortThreadReplyRows(
  rows: ThreadReplyRow[],
  sort: ThreadReplySort,
  engagement: Record<string, PostEngagement | undefined>
): ThreadReplyRow[] {
  if (sort === 'relevant') return rows;
  const posts = rows.flatMap((row) => (row.kind === 'post' ? [row.post] : []));
  const sorted = [...posts].sort((a, b) => {
    if (sort === 'recent') {
      return Number(b.blockTimestamp) - Number(a.blockTimestamp);
    }
    const scoreDelta =
      trendingScore(b, engagement) - trendingScore(a, engagement);
    if (scoreDelta !== 0) return scoreDelta;
    return Number(b.blockTimestamp) - Number(a.blockTimestamp);
  });
  return sorted.map((post) => ({
    kind: 'post',
    post,
    connectedToPrevious: false,
  }));
}
