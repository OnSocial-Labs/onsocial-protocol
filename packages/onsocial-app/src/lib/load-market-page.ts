import {
  fetchMarketListings,
  fetchMarketSales,
  type MarketListingsPage,
  type MarketSaleItem,
} from '@/features/market/market-listings';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type MarketPageData = {
  listings: MarketListingsPage;
  sales: MarketSaleItem[];
};

/**
 * Default Market browse shell (newest, unfiltered) for SSR first paint.
 * Soft client refresh covers filter/sort/search and wallet “Yours”.
 * Discovery URL params (`kind` / `facets` / `audioFormat` / creator / app)
 * skip this seed in the panel and fetch the narrowed catalog instead.
 * Primary thought post-mints are stripped from the All seed in the panel;
 * open `?kind=thought` for those.
 */
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
