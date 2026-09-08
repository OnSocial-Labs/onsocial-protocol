import { expect, type Locator, type Page } from '@playwright/test';
import {
  E2E_GRAPH_COOKIE,
  e2eSeriesCatalogRows,
  type E2eGraphCatalog,
} from '../../src/lib/e2e-graph-stubs';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';

function e2eCookieUrl(): string {
  return (
    process.env.PLAYWRIGHT_TEST_BASE_URL ??
    process.env.E2E_BASE_URL ??
    `http://${process.env.E2E_HOST ?? 'localhost'}:${process.env.E2E_PORT ?? 3099}`
  );
}

/** Opt SSR + BFF into a catalog fixture. Omit for the SSR-miss skeleton test. */
export async function setE2eGraphCatalog(
  page: Page,
  catalog: E2eGraphCatalog
): Promise<void> {
  await page.context().addCookies([
    {
      name: E2E_GRAPH_COOKIE,
      value: `catalog=${catalog}`,
      url: e2eCookieUrl(),
    },
  ]);
}

/** Settled series shell — excludes loading skeletons (page + intercept). */
export function seriesPageRoot(page: Page): Locator {
  return page.locator('.series-page:not(.series-page--skeleton)');
}

export async function expectSeriesPageSettled(page: Page): Promise<void> {
  await expect(page.locator('[data-series-page-skeleton]')).toHaveCount(0, {
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect(seriesPageRoot(page)).toHaveCount(1);
}

/** Browser GraphQL for series catalog settle. Pair with `setE2eGraphCatalog` for SSR. */
export async function stubSeriesCreatorCatalog(
  page: Page,
  opts?: {
    rows?: E2eGraphCatalog;
    catalogDelayMs?: number;
  }
): Promise<void> {
  const rows = opts?.rows ?? 'empty';
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
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
          data: { scarcesCollectionsCurrent: e2eSeriesCatalogRows(rows) },
        }),
      });
      return;
    }

    await route.continue();
  });
}
