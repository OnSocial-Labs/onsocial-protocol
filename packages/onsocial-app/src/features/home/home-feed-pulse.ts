import type { FeedSort, OnSocial, Paginated, PostRow } from '@onsocial/sdk';

/** Hasura standing page — keep fetching until a short page. */
export const STANDING_SOURCE_PAGE = 100;

type OutgoingStandingPage = (
  accountId: string,
  opts: { limit: number; offset: number }
) => Promise<readonly string[]>;

/** You plus every outgoing stand — not one list page. */
export async function collectOutgoingStandingSources(
  accountId: string,
  outgoing: OutgoingStandingPage
): Promise<string[]> {
  const standing: string[] = [];
  let offset = 0;
  for (;;) {
    const page = await outgoing(accountId, {
      limit: STANDING_SOURCE_PAGE,
      offset,
    });
    if (page.length === 0) break;
    standing.push(...page);
    if (page.length < STANDING_SOURCE_PAGE) break;
    offset += page.length;
  }
  return Array.from(new Set([accountId, ...standing]));
}

/** Strict stood-with feed — circle-only, no stranger bridges. */
export async function fetchCircleFeedPage(
  client: OnSocial,
  sources: readonly string[],
  opts: { limit?: number; offset?: number; sort?: FeedSort } = {}
): Promise<Paginated<PostRow>> {
  if (sources.length === 0) return { items: [] };
  return client.query.feed.fromAccounts({
    accounts: [...sources],
    limit: opts.limit,
    offset: opts.offset,
    sort: opts.sort,
    nativeOnly: true,
  });
}

/**
 * Pulse feed — circle posts plus stranger threads a stood-with account
 * replied into (parent + newest circle peek).
 */
export async function fetchPulseFeedPage(
  client: OnSocial,
  sources: readonly string[],
  opts: { limit?: number; offset?: number; sort?: FeedSort } = {}
): Promise<Paginated<PostRow>> {
  if (sources.length === 0) return { items: [] };
  return client.query.feed.pulse({
    accounts: [...sources],
    limit: opts.limit,
    offset: opts.offset,
    sort: opts.sort,
  });
}

export function isHomeFeedSocialLens(
  lens: 'pulse' | 'circle' | 'global' | 'saved'
): lens is 'pulse' | 'circle' {
  return lens === 'pulse' || lens === 'circle';
}
