import type { Paginated, PostRow } from '@onsocial/sdk';
import {
  collectOutgoingStandingSources,
  fetchCircleFeedPage,
  fetchPulseFeedPage,
  isHomeFeedSocialLens,
  type HomeFeedPageCursor,
} from '@/features/home/home-feed-pulse';
import type { HomeFeedFocus } from '@/features/home/home-feed-focus';
import type { HomeFeedLens } from '@/features/home/home-feed-lens';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';
import {
  collectResolvedSavePage,
  countVisibleHomeFeedCards,
  fillVisibleFeedPage,
} from '@/features/home/home-feed-visible';
import { postKey } from '@/features/home/post-card';
import { sortPostsByHot } from '@/lib/amplify-heat';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchDaoRolesPage } from '@/lib/fetch-dao-roles-client';
import {
  fetchIndexedPostsByRefs,
  indexedPostRefKey,
} from '@/lib/fetch-personal-post';
import {
  feedAuthorIds,
  FEED_REVEAL_BUDGET_MS,
  loadFeedPollTallies,
  loadFeedQuotes,
  quotedSeedFromFeedRows,
  seedDaoMembershipMisses,
  sequenceFeedQuoteThenTally,
  settleFeedSidePaint,
  type FeedQuoteSeed,
} from '@/lib/prepare-feed-paint';
import type { PollTally } from '@/lib/poll-votes';
import type { ProtocolDaoMemberships } from '@/lib/protocol-dao-memberships';
import { parseSaveContentPath } from '@/lib/save-content-path';
import { filterHiddenAuthors } from '@/lib/viewer-mute-block-filter';

export const HOME_FEED_PAGE_SIZE = 24;

async function fetchSavedFeedPage(
  accountId: string,
  cursor: HomeFeedPageCursor,
  limit: number
): Promise<Paginated<PostRow>> {
  const client = createReadOnlyOnSocialClient();
  return collectResolvedSavePage({
    limit,
    cursor: {
      offset: cursor.offset,
      beforeBlockHeight: cursor.beforeBlockHeight,
      beforeContentPath: cursor.beforeEventKey,
    },
    loadRefs: async (loadCursor, pageLimit) => {
      const saves = await client.query.saves.list(accountId, {
        limit: pageLimit,
        offset: loadCursor.offset,
        beforeBlockHeight: loadCursor.beforeBlockHeight,
        beforeContentPath: loadCursor.beforeContentPath,
      });
      return saves.map((row) => ({
        ref: parseSaveContentPath(row.contentPath),
        blockHeight: row.blockHeight,
        contentPath: row.contentPath,
      }));
    },
    hydrate: (refs) => fetchIndexedPostsByRefs([...refs]),
    refKey: (ref) => indexedPostRefKey(ref.author, ref.postId),
  });
}

export function mergeFeedPosts(
  current: PostRow[],
  incoming: PostRow[]
): PostRow[] {
  if (incoming.length === 0) return current;

  const seen = new Set(current.map(postKey));
  const merged = [...current];

  for (const post of incoming) {
    const key = postKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(post);
  }

  return merged;
}

async function resolveStandingSources(accountId: string): Promise<string[]> {
  const client = createReadOnlyOnSocialClient();
  return collectOutgoingStandingSources(accountId, (id, opts) =>
    client.query.standings.outgoing(id, opts)
  );
}

/** Client home-feed page — mirrors SSR `loadHomeFeedPage` for soft loads. */
export async function fetchHomeFeedPageClient(
  lens: HomeFeedLens,
  accountId: string | null,
  cursor: HomeFeedPageCursor,
  standingSources: string[] | null,
  sort: HomeFeedSort,
  limit: number = HOME_FEED_PAGE_SIZE,
  options: { fillVisible?: boolean } = {}
): Promise<{ page: Paginated<PostRow>; standingSources: string[] | null }> {
  const client = createReadOnlyOnSocialClient();
  const offset = cursor.offset ?? 0;

  if (lens === 'saved' && accountId) {
    const page = await fetchSavedFeedPage(accountId, cursor, limit);
    return { page, standingSources: null };
  }

  if (isHomeFeedSocialLens(lens) && accountId) {
    const sources =
      standingSources ?? (await resolveStandingSources(accountId));

    if (sources.length === 0) {
      return { page: { items: [] }, standingSources: sources };
    }

    const page =
      lens === 'circle'
        ? await fetchCircleFeedPage(client, sources, {
            limit,
            offset,
            sort,
            beforeBlockHeight: cursor.beforeBlockHeight,
            beforeHeat: cursor.beforeEventHeat,
            beforePostKey: cursor.beforeEventKey,
          })
        : await fetchPulseFeedPage(client, sources, {
            limit,
            offset,
            sort,
            beforeEventHeight: cursor.beforeEventHeight,
            beforeEventHeat: cursor.beforeEventHeat,
            beforeEventKey: cursor.beforeEventKey,
          });
    return { page, standingSources: sources };
  }

  const fetchRecent = (pageCursor: HomeFeedPageCursor, pageLimit: number) =>
    client.query.feed.recent({
      limit: pageLimit,
      offset: pageCursor.offset,
      beforeBlockHeight: pageCursor.beforeBlockHeight,
      beforeHeat: pageCursor.beforeEventHeat,
      beforePostKey: pageCursor.beforeEventKey,
      sort,
    });
  const page =
    options.fillVisible === false
      ? await fetchRecent(cursor, limit)
      : await fillVisibleFeedPage({
          cursor,
          limit,
          fetchPage: fetchRecent,
          visibleCount: (posts) =>
            countVisibleHomeFeedCards(filterHiddenAuthors(posts)),
        });
  return { page, standingSources: null };
}

export async function loadFocusedFeedPage(
  focus: HomeFeedFocus,
  cursor: HomeFeedPageCursor,
  {
    limit = HOME_FEED_PAGE_SIZE,
    sort = 'recent',
  }: { limit?: number; sort?: HomeFeedSort } = {}
): Promise<Paginated<PostRow>> {
  const client = createReadOnlyOnSocialClient();
  const opts = {
    limit,
    offset: cursor.offset,
    beforeBlockHeight: cursor.beforeBlockHeight,
    beforePostKey: cursor.beforeEventKey,
    beforeHeat: cursor.beforeEventHeat,
    sort,
  };
  const page =
    focus.kind === 'ticker'
      ? await client.query.feed.byTicker(focus.value, opts)
      : focus.kind === 'place'
        ? await client.query.feed.byPlace(focus.value, opts)
        : await client.query.feed.byHashtag(focus.value, opts);
  // Server orders topic indexes by heat under Hot (chrono while the heat
  // column rolls out). The local epsilon re-sort is idempotent on server
  // order; append paths re-rank the full accumulated list so cross-page
  // order holds.
  if (sort !== 'hot') return page;
  return { ...page, items: sortPostsByHot(page.items) };
}

/** Quotes / tallies / DAO marks for a page — soft-fills after rows paint. */
export async function loadFeedPaint(posts: PostRow[]): Promise<{
  quoted: FeedQuoteSeed;
  tallies: Record<string, PollTally>;
  memberships: Record<string, ProtocolDaoMemberships>;
}> {
  const empty = {
    quoted: {} as FeedQuoteSeed,
    tallies: {} as Record<string, PollTally>,
    memberships: {} as Record<string, ProtocolDaoMemberships>,
  };
  try {
    const client = createReadOnlyOnSocialClient();
    const quotedFromRows = quotedSeedFromFeedRows(posts);
    const reads = sequenceFeedQuoteThenTally(
      quotedFromRows
        ? Promise.resolve(quotedFromRows)
        : loadFeedQuotes(posts, client),
      () => loadFeedPollTallies(posts, client)
    );
    const authorIds = feedAuthorIds(posts, {});
    const paint = await settleFeedSidePaint({
      quotes: reads.quotes,
      tallies: reads.tallies,
      memberships: (signal) => fetchDaoRolesPage(authorIds, signal),
      capMs: FEED_REVEAL_BUDGET_MS,
    });
    return {
      ...paint,
      memberships: seedDaoMembershipMisses(authorIds, paint.memberships),
    };
  } catch {
    return {
      ...empty,
      memberships: seedDaoMembershipMisses(feedAuthorIds(posts, {}), {}),
    };
  }
}
