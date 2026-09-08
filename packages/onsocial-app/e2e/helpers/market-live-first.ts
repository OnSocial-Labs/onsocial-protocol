import type { Page } from '@playwright/test';
import { e2eMarketListingRows } from '../../src/lib/e2e-graph-stubs';

/** Newest row is an ended auction so live-first rank has to move it. */
export async function stubMarketLiveFirstBrowse(page: Page): Promise<void> {
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
          data: { scarcesActiveListings: e2eMarketListingRows('live-first') },
        }),
      });
      return;
    }

    await route.continue();
  });
}
