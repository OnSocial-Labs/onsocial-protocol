import type { Paginated, PostRow } from '@onsocial/sdk';
import type { HomeFeedLens } from '@/features/home/home-feed-lens';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';

/**
 * Cold first visit — the public hot page is requested before the wallet and
 * lens resolve, then adopted exactly like the SSR hot seed: kept as the
 * final list for global/hot, soft-refreshed over for any other lens or sort.
 */
export function shouldRequestSpeculativeFeedPage(input: {
  restoredSession: unknown;
  initialPage: Paginated<PostRow> | null;
  hasFocus: boolean;
}): boolean {
  return (
    input.restoredSession == null &&
    input.initialPage == null &&
    !input.hasFocus
  );
}

/** Adopt only onto an empty, un-bootstrapped list — never over live rows. */
export function shouldAdoptSpeculativeFeedPage(input: {
  speculativePage: Paginated<PostRow> | null;
  initialPage: Paginated<PostRow> | null;
  hasFocus: boolean;
  postsLength: number;
  bootstrapDone: boolean;
}): boolean {
  return (
    input.speculativePage != null &&
    input.initialPage == null &&
    !input.hasFocus &&
    input.postsLength === 0 &&
    !input.bootstrapDone
  );
}

/** Global/hot already IS the speculative page — anything else refreshes over it. */
export function speculativeFeedKeepsPaint(
  lens: HomeFeedLens,
  sort: HomeFeedSort
): boolean {
  return lens === 'global' && sort === 'hot';
}
