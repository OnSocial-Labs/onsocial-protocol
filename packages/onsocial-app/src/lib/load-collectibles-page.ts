import {
  fetchOwnedScarcesPage,
  type OwnedScarcesPage,
} from '@/features/market/market-listings';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import {
  parseMarketMediumFilter,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import {
  normalizeDropFacetMedium,
  normalizeDropFacets,
  parseAudioFormat,
} from '@/features/scarces/drop-facets';
import {
  APP_COLLECTIBLES_PATH,
  COLLECTIBLES_SEARCH_PARAM,
  COLLECTIBLES_SERIES_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  MARKET_CREATOR_PARAM,
  MARKET_FACETS_PARAM,
  MARKET_KIND_PARAM,
  MARKET_SORT_PARAM,
  marketFacetsParamValue,
  parseMarketFacetsParam,
} from '@/lib/app-routes';
import { normalizeAccountRoute } from '@/lib/account-route';
import { overlayPath } from '@/lib/overlay-routes';
import type { CollectiblesLibrarySort } from '@/lib/portfolio-holdings';

export type CollectiblesPageData = {
  /** First owned page when a wallet account is known server-side. */
  holdings: OwnedScarcesPage | null;
  accountId: string | null;
};

/** Parsed Collectibles URL — SSR chrome seed and client query share this shape. */
export type CollectiblesPageQuery = {
  q: string;
  kind: MarketMediumFilter;
  facets: string[];
  audioFormat: MarketAudioFormatFilter;
  /** Drop creator account, or `other` for holdings without a creator. */
  creator: string | null;
  /** Series id (or title key) from vault inventory. */
  series: string | null;
  /** Newest (first-seen) or A–Z by creator name. */
  sort: CollectiblesLibrarySort;
};

export const EMPTY_COLLECTIBLES_PAGE_QUERY: CollectiblesPageQuery = {
  q: '',
  kind: 'all',
  facets: [],
  audioFormat: null,
  creator: null,
  series: null,
  sort: 'newest',
};

function parseVaultFilterId(raw: string | null | undefined): string | null {
  const value = raw?.trim() || '';
  return value || null;
}

export function parseCollectiblesPageQuery(params: {
  q?: string | null;
  kind?: string | null;
  facets?: string | null;
  audioFormat?: string | null;
  creator?: string | null;
  series?: string | null;
  sort?: string | null;
}): CollectiblesPageQuery {
  const kind = parseMarketMediumFilter(params.kind);
  const facetMedium = normalizeDropFacetMedium(kind);
  const facets = facetMedium
    ? normalizeDropFacets(parseMarketFacetsParam(params.facets), facetMedium)
    : [];
  return {
    q: params.q?.trim() ?? '',
    kind,
    facets,
    audioFormat:
      facetMedium === 'audio' ? parseAudioFormat(params.audioFormat) : null,
    creator: parseVaultFilterId(params.creator),
    series: parseVaultFilterId(params.series),
    sort: params.sort?.trim().toLowerCase() === 'name' ? 'name' : 'newest',
  };
}

/** Parse Collectibles discovery from `window.location.search` or a query string. */
export function parseCollectiblesPageQueryFromSearch(
  search: string | URLSearchParams
): CollectiblesPageQuery {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  return parseCollectiblesPageQuery({
    q: params.get(COLLECTIBLES_SEARCH_PARAM),
    kind: params.get(MARKET_KIND_PARAM),
    facets: params.get(MARKET_FACETS_PARAM),
    audioFormat: params.get(MARKET_AUDIO_FORMAT_PARAM),
    creator: params.get(MARKET_CREATOR_PARAM),
    series: params.get(COLLECTIBLES_SERIES_PARAM),
    sort: params.get(MARKET_SORT_PARAM),
  });
}

/**
 * Portfolio vault account from `/@id/collectibles`. OS `/collectibles` has none.
 */
export function collectiblesAccountIdFromPathname(
  pathname: string
): string | null {
  const match = pathname.match(/^\/(@[^/]+)\/collectibles\/?$/);
  if (!match?.[1]) return null;
  return normalizeAccountRoute(match[1]);
}

/** Path for the current vault query — omits default All / empty search. */
export function collectiblesQueryPath(
  accountId: string | null,
  query: CollectiblesPageQuery
): string {
  const owner = accountId?.trim() || null;
  const base = owner
    ? overlayPath(owner, 'collectibles')
    : APP_COLLECTIBLES_PATH;
  const params = new URLSearchParams();
  if (query.q) params.set(COLLECTIBLES_SEARCH_PARAM, query.q);
  if (query.kind !== 'all') params.set(MARKET_KIND_PARAM, query.kind);
  const facets = marketFacetsParamValue(query.facets);
  if (facets) params.set(MARKET_FACETS_PARAM, facets);
  if (query.audioFormat) {
    params.set(MARKET_AUDIO_FORMAT_PARAM, query.audioFormat);
  }
  if (query.creator) params.set(MARKET_CREATOR_PARAM, query.creator);
  if (query.series) params.set(COLLECTIBLES_SERIES_PARAM, query.series);
  if (query.sort === 'name') params.set(MARKET_SORT_PARAM, 'name');
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function collectiblesToolbarFromQuery(query: CollectiblesPageQuery): {
  q: string;
  kind: MarketMediumFilter;
  facets: string[];
  audioFormat: MarketAudioFormatFilter;
  creator: string | null;
  series: string | null;
  sort: CollectiblesLibrarySort;
} {
  return {
    q: query.q,
    kind: query.kind,
    facets: query.facets,
    audioFormat: query.audioFormat,
    creator: query.creator,
    series: query.series,
    sort: query.sort,
  };
}

export function collectiblesSeedParamsKey(query: CollectiblesPageQuery): string {
  return [
    query.q.trim().toLowerCase(),
    query.kind,
    query.facets.join(','),
    query.audioFormat ?? '',
    query.creator ?? '',
    query.series ?? '',
    query.sort,
  ].join('|');
}

/**
 * Held catalog for an account. Portfolio `/@id/collectibles` always passes the
 * page account; OS `/collectibles` may pass null (disconnected shell) until the
 * client soft-redirects to `/@you/collectibles`.
 *
 * Seed is the first owned page — kind / search filter client-side. Soft-fail
 * → null holdings so the client can retry.
 */
export async function loadCollectiblesPageData(
  accountId?: string | null
): Promise<CollectiblesPageData> {
  const owner = accountId?.trim() || null;
  if (!owner) {
    return { holdings: null, accountId: null };
  }
  try {
    const holdings = await fetchOwnedScarcesPage(owner, {
      pageSize: 24,
      bypassCache: true,
    });
    return { holdings, accountId: owner };
  } catch {
    return { holdings: null, accountId: owner };
  }
}
