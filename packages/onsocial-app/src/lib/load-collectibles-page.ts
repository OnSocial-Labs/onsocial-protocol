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
  MARKET_AUDIO_FORMAT_PARAM,
  MARKET_FACETS_PARAM,
  MARKET_KIND_PARAM,
  marketFacetsParamValue,
  parseMarketFacetsParam,
} from '@/lib/app-routes';
import { overlayPath } from '@/lib/overlay-routes';

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
};

export const EMPTY_COLLECTIBLES_PAGE_QUERY: CollectiblesPageQuery = {
  q: '',
  kind: 'all',
  facets: [],
  audioFormat: null,
};

export function parseCollectiblesPageQuery(params: {
  q?: string | null;
  kind?: string | null;
  facets?: string | null;
  audioFormat?: string | null;
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
  };
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
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function collectiblesToolbarFromQuery(query: CollectiblesPageQuery): {
  q: string;
  kind: MarketMediumFilter;
  facets: string[];
  audioFormat: MarketAudioFormatFilter;
} {
  return {
    q: query.q,
    kind: query.kind,
    facets: query.facets,
    audioFormat: query.audioFormat,
  };
}

export function collectiblesSeedParamsKey(query: CollectiblesPageQuery): string {
  return [
    query.q.trim().toLowerCase(),
    query.kind,
    query.facets.join(','),
    query.audioFormat ?? '',
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
