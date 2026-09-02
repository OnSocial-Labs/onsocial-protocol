import {
  fetchMarketListings,
  fetchMarketSales,
  type MarketListingsPage,
  type MarketSaleItem,
} from '@/features/market/market-listings';
import type { MarketAudioFormatFilter } from '@/features/market/market-audio-format';
import {
  listingFilterFromSort,
  type MarketListingFilter,
} from '@/features/market/market-listing-filter';
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
  APP_MARKET_PATH,
  MARKET_APP_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  MARKET_CREATOR_PARAM,
  MARKET_FACETS_PARAM,
  MARKET_KIND_PARAM,
  MARKET_SORT_PARAM,
  marketFacetsParamValue,
  parseMarketFacetsParam,
  parseMarketSortParam,
  type MarketSortParam,
} from '@/lib/app-routes';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type MarketPageData = {
  listings: MarketListingsPage;
  sales: MarketSaleItem[];
};

/** Parsed Market URL — SSR seed and client catalog key share this shape. */
export type MarketPageQuery = {
  kind: MarketMediumFilter;
  creator: string;
  app: string;
  facets: string[];
  audioFormat: MarketAudioFormatFilter;
  sort: MarketSortParam;
};

export const EMPTY_MARKET_PAGE_QUERY: MarketPageQuery = {
  kind: 'all',
  creator: '',
  app: '',
  facets: [],
  audioFormat: null,
  sort: 'newest',
};

export function parseMarketPageQuery(params: {
  kind?: string | null;
  creator?: string | null;
  app?: string | null;
  facets?: string | null;
  audioFormat?: string | null;
  sort?: string | null;
}): MarketPageQuery {
  const kind = parseMarketMediumFilter(params.kind);
  const facetMedium = normalizeDropFacetMedium(kind);
  const facets = facetMedium
    ? normalizeDropFacets(parseMarketFacetsParam(params.facets), facetMedium)
    : [];
  return {
    kind,
    creator: params.creator?.trim().toLowerCase() ?? '',
    app: params.app?.trim() ?? '',
    facets,
    audioFormat:
      facetMedium === 'audio' ? parseAudioFormat(params.audioFormat) : null,
    sort: parseMarketSortParam(params.sort),
  };
}

export function parseMarketPageQueryFromSearch(
  search: string
): MarketPageQuery {
  const sp = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  return parseMarketPageQuery({
    kind: sp.get(MARKET_KIND_PARAM),
    creator: sp.get(MARKET_CREATOR_PARAM),
    app: sp.get(MARKET_APP_PARAM),
    facets: sp.get(MARKET_FACETS_PARAM),
    audioFormat: sp.get(MARKET_AUDIO_FORMAT_PARAM),
    sort: sp.get(MARKET_SORT_PARAM),
  });
}

/**
 * Catalog cache / fetch key. Shape:
 * `retry|filter|sort|query|creator|app|medium|facets|audioFormat`
 */
export function marketBrowseParamsKey(opts: {
  retryKey?: number;
  listingFilter: MarketListingFilter;
  sort: MarketSortParam;
  search?: string;
  creator?: string;
  app?: string;
  kind?: MarketMediumFilter;
  facets?: string[];
  audioFormat?: MarketAudioFormatFilter | string | null;
}): string {
  return [
    opts.retryKey ?? 0,
    opts.listingFilter,
    opts.sort,
    (opts.search ?? '').toLowerCase(),
    opts.creator ?? '',
    opts.app ?? '',
    opts.kind ?? 'all',
    (opts.facets ?? []).join(','),
    opts.audioFormat ?? '',
  ].join('|');
}

/** Path for the current Market query — omits default All / newest. */
export function marketQueryPath(query: MarketPageQuery): string {
  const params = new URLSearchParams();
  if (query.kind !== 'all') params.set(MARKET_KIND_PARAM, query.kind);
  if (query.creator) params.set(MARKET_CREATOR_PARAM, query.creator);
  if (query.app) params.set(MARKET_APP_PARAM, query.app);
  const facets = marketFacetsParamValue(query.facets);
  if (facets) params.set(MARKET_FACETS_PARAM, facets);
  if (query.audioFormat) {
    params.set(MARKET_AUDIO_FORMAT_PARAM, query.audioFormat);
  }
  if (query.sort !== 'newest') params.set(MARKET_SORT_PARAM, query.sort);
  const qs = params.toString();
  return qs ? `${APP_MARKET_PATH}?${qs}` : APP_MARKET_PATH;
}

export function marketToolbarFromQuery(query: MarketPageQuery): {
  listingFilter: ReturnType<typeof listingFilterFromSort>;
  listingSort: MarketSortParam;
  kind: MarketMediumFilter;
  audioFormat: MarketAudioFormatFilter;
  facets: string[];
} {
  return {
    listingFilter: listingFilterFromSort(query.sort),
    listingSort: query.sort,
    kind: query.kind,
    audioFormat: query.audioFormat,
    facets: query.facets,
  };
}

export function marketSeedParamsKey(query: MarketPageQuery): string {
  return marketBrowseParamsKey({
    listingFilter: listingFilterFromSort(query.sort),
    sort: query.sort,
    creator: query.creator,
    app: query.app,
    kind: query.kind,
    facets: query.facets,
    audioFormat: query.audioFormat,
  });
}

/**
 * First-paint catalog for the current URL (kind / format / sort / seller).
 * Soft-fail → null so the client can retry. Primary thought post-mints stay
 * out of the All seed; open `?kind=thought` for those.
 */
export async function loadMarketPageData(
  query: MarketPageQuery = EMPTY_MARKET_PAGE_QUERY
): Promise<MarketPageData | null> {
  try {
    const client = createServerOnSocialClient();
    const skipSales = Boolean(query.creator || query.app);
    const [listings, sales] = await Promise.all([
      fetchMarketListings({
        limit: 40,
        sort: query.sort,
        ...(query.sort === 'ending' ? { kinds: ['auction'] } : {}),
        ...(query.creator ? { sellerId: query.creator } : {}),
        ...(query.app ? { appId: query.app } : {}),
        ...(query.kind !== 'all' ? { mediumKind: query.kind } : {}),
        ...(query.facets.length ? { facets: query.facets } : {}),
        ...(query.audioFormat ? { audioFormat: query.audioFormat } : {}),
        excludePrimaryThoughts: query.kind === 'all',
        client,
      }),
      skipSales
        ? Promise.resolve([] as MarketSaleItem[])
        : fetchMarketSales({ limit: 20, client }),
    ]);
    return { listings, sales };
  } catch {
    return null;
  }
}
