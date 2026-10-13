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
