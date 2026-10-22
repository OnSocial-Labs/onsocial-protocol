import type { PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';

/** Next article in the same reader. A second tap on the open piece stays put. */
export function pushArticleTrail(
  trail: readonly PostRow[],
  post: PostRow
): PostRow[] {
  const last = trail[trail.length - 1];
  if (last && postKey(last) === postKey(post)) return trail.slice();
  return [...trail, post];
}

/**
 * Previous article. Null when this is the piece opened from the feed or shelf —
 * that back leaves the reader.
 */
export function popArticleTrail(trail: readonly PostRow[]): PostRow[] | null {
  if (trail.length <= 1) return null;
  return trail.slice(0, -1);
}

/**
 * Permalink back. A trail step stays in the reader. Otherwise return to the
 * screen that opened it (the drop). The author shelf is only a cold open.
 */
export function articlePermalinkBack(opts: {
  poppedTrail: boolean;
  historyLength: number;
}): 'trail' | 'history' | 'shelf' {
  if (opts.poppedTrail) return 'trail';
  if (opts.historyLength > 1) return 'history';
  return 'shelf';
}
