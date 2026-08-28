import type { FeedSort, OnSocial, Paginated, PostRow } from '@onsocial/sdk';

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
