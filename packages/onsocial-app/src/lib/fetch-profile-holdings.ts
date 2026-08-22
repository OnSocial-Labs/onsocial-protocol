import { cache } from 'react';
import { fetchOwnedScarcesPage } from '@/features/market/market-listings';
import {
  PAGE_DRAWER_HOLDINGS_PEEK,
  toPortfolioHoldingPeek,
  type PortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

/** First-page Collectibles peeks for the page drawer — streamed with Store. */
export const fetchProfileHoldingsPeeks = cache(
  async (accountId: string): Promise<PortfolioHoldingPeek[]> => {
    const owner = accountId.trim();
    if (!owner) return [];
    try {
      const page = await fetchOwnedScarcesPage(owner, {
        pageSize: PAGE_DRAWER_HOLDINGS_PEEK,
      });
      return page.items.map(toPortfolioHoldingPeek);
    } catch {
      return [];
    }
  }
);
