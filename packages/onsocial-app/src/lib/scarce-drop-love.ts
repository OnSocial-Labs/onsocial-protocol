/**
 * Drop-level love — collection as a whole (cards, books, albums).
 * Distinct from:
 *   - track loves: `scarce/{id}/track/{cid}`
 *   - bookmarks:   `scarce/collection/{id}` (private save)
 *   - post likes:  `post/{id}` kind `like`
 */

import { accountIdsEqual } from '@/lib/account-match';

export const SCARCE_DROP_LOVE_KIND = 'love';

/** Content path for loving a Drop (collection). */
export function scarceDropContentPath(collectionId: string): string {
  const id = collectionId.trim();
  if (!id) throw new Error('scarceDropContentPath requires a collectionId');
  return `scarce/${id}`;
}

export function scarceDropLovePathLike(collectionId: string): string {
  return `%/scarce/${collectionId}`;
}

/** True when a reaction postPath is exactly this drop (not a track under it). */
export function isScarceDropLovePostPath(
  collectionId: string,
  postPath: string
): boolean {
  return postPath.trim() === scarceDropContentPath(collectionId);
}

export type DropLoveLedger = { loved: boolean } | null;

/**
 * Fans are other people. `indexedFanCount` is `scarce_drop_love_fans`, which
 * already leaves the creator out. When that read fails, a creator's own love
 * is taken off the raw reaction total.
 */
export function dropFanCount(opts: {
  indexedFanCount: number | null;
  reactionCount: number;
  creatorLoved: boolean;
}): number {
  if (opts.indexedFanCount != null && Number.isFinite(opts.indexedFanCount)) {
    return Math.max(0, Math.floor(opts.indexedFanCount));
  }
  const raw = Math.max(0, Math.floor(opts.reactionCount) || 0);
  return opts.creatorLoved ? Math.max(0, raw - 1) : raw;
}

/** The drawer lists these people. An empty roster means there are no fans. */
export function dropFanCountMatchingRoster(opts: {
  fanCount: number;
  fanIds: readonly string[];
}): number {
  if (opts.fanIds.length === 0) return 0;
  return Math.max(Math.max(0, opts.fanCount), opts.fanIds.length);
}

export function nextDropFanCountAfterToggle(opts: {
  fanCount: number;
  creatorId: string;
  viewerId: string | null;
  apiLoved: boolean;
  nextLoved: boolean;
}): number {
  if (!opts.viewerId || accountIdsEqual(opts.viewerId, opts.creatorId)) {
    return opts.fanCount;
  }
  if (opts.apiLoved === opts.nextLoved) return opts.fanCount;
  if (opts.nextLoved) return opts.fanCount + 1;
  return Math.max(0, opts.fanCount - 1);
}

export function nextDropFanIdsAfterToggle(opts: {
  fanIds: readonly string[];
  creatorId: string;
  viewerId: string | null;
  apiLoved: boolean;
  nextLoved: boolean;
}): string[] {
  const viewerId = opts.viewerId?.trim() || '';
  if (!viewerId || accountIdsEqual(viewerId, opts.creatorId)) {
    return [...opts.fanIds];
  }
  const withoutViewer = opts.fanIds.filter(
    (id) => !accountIdsEqual(id, viewerId)
  );
  if (opts.apiLoved === opts.nextLoved) return [...opts.fanIds];
  if (opts.nextLoved) return [viewerId, ...withoutViewer];
  return withoutViewer;
}

export function dedupeDropFanIds(
  rows: ReadonlyArray<{ accountId?: string | null }>,
  creatorId: string
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const id = row.accountId?.trim() || '';
    if (!id || accountIdsEqual(id, creatorId)) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}
