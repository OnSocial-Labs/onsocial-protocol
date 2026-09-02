import {
  fetchMarketListings,
  fetchMarketSales,
  type MarketListingsPage,
  type MarketSaleItem,
} from '@/features/market/market-listings';
import { parseMarketSortParam } from '@/lib/app-routes';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type MarketPageData = {
  listings: MarketListingsPage;
  sales: MarketSaleItem[];
};

/**
 * Default Market browse shell (newest, unfiltered) for SSR first paint.
 * Soft client refresh covers filter/sort/search and wallet “Yours”.
 * Discovery URL params (`kind` / `facets` / `audioFormat` / creator / app)
 * skip this seed in the panel and fetch the narrowed catalog instead —
 * do not even fetch the default catalog on those URLs (wasted TTFB).
 * Primary thought post-mints are stripped from the All seed in the panel;
 * open `?kind=thought` for those.
 */
export function shouldSeedMarketDefaultBrowse(params: {
  kind?: string | null;
  creator?: string | null;
  app?: string | null;
  facets?: string | null;
  audioFormat?: string | null;
  sort?: string | null;
}): boolean {
  if (params.kind?.trim()) return false;
  if (params.creator?.trim()) return false;
  if (params.app?.trim()) return false;
  if (params.facets?.trim()) return false;
  if (params.audioFormat?.trim()) return false;
  return parseMarketSortParam(params.sort) === 'newest';
}

export async function loadMarketPageData(): Promise<MarketPageData | null> {
  try {
    const client = createServerOnSocialClient();
    const [listings, sales] = await Promise.all([
      fetchMarketListings({
        limit: 40,
        sort: 'newest',
        excludePrimaryThoughts: true,
        client,
      }),
      fetchMarketSales({ limit: 20, client }),
    ]);
    return { listings, sales };
  } catch {
    return null;
  }
}
