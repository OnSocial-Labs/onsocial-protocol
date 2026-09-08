import type { Page } from '@playwright/test';
import {
  E2E_MARKET_CREATOR,
  e2eMarketListingRows,
  e2eMarketShopCatalogRows,
  type E2eGraphMarket,
} from '../../src/lib/e2e-graph-stubs';

export const MARKET_E2E_CREATOR = E2E_MARKET_CREATOR;

function shopFixture(opts?: {
  drops?: 'night-drive' | 'empty';
}): E2eGraphMarket {
  return opts?.drops === 'night-drive' ? 'shop' : 'shop-empty';
}

/** Browser GraphQL for creator shop. Pair with `setE2eGraphMarket` for SSR. */
export async function stubMarketCreatorShop(
  page: Page,
  opts?: {
    creatorId?: string;
    drops?: 'night-drive' | 'empty';
    listings?: 'empty';
    catalogDelayMs?: number;
  }
): Promise<void> {
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  const market = shopFixture(opts);
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (query.includes('ScarcesActiveListings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesActiveListings: e2eMarketListingRows(market) },
        }),
      });
      return;
    }

    if (
      query.includes('ScarcesCollectionsCurrent') &&
      !query.includes('ScarcesCollectionsCurrentByIds')
    ) {
      if (catalogDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, catalogDelayMs));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: e2eMarketShopCatalogRows(market) },
        }),
      });
      return;
    }

    await route.continue();
  });
}
