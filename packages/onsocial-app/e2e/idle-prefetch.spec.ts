import { expect, test, type Page, type Request } from '@playwright/test';
import { gotoApp } from './helpers';

/**
 * Background RSC prefetch must settle. A livelock re-requests the same href
 * many times while the page sits idle.
 */
const IDLE_MS = 15_000;
const MAX_PREFETCHES_PER_HREF = 3;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

const ROUTES = ['/discover', '/home'] as const;

function prefetchHref(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('_rsc');
  const search = parsed.searchParams.toString();
  return search ? `${parsed.pathname}?${search}` : parsed.pathname;
}

function isRscPrefetch(request: Request): boolean {
  if (request.method() !== 'GET') return false;
  const headers = request.headers();
  return headers['rsc'] === '1' && headers['next-router-prefetch'] === '1';
}

function trackIdlePrefetches(page: Page): Map<string, number> {
  const counts = new Map<string, number>();
  page.on('request', (request) => {
    if (!isRscPrefetch(request)) return;
    const href = prefetchHref(request.url());
    counts.set(href, (counts.get(href) ?? 0) + 1);
  });
  return counts;
}

test.describe('idle prefetch', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route} sends at most ${MAX_PREFETCHES_PER_HREF} RSC prefetches per href at ${viewport.width}x${viewport.height}`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        const counts = trackIdlePrefetches(page);

        const postLink = page.locator('a[href*="/posts/"]').first();
        await gotoApp(page, route);
        await expect(postLink).toBeAttached();

        counts.clear();
        await page.waitForTimeout(IDLE_MS);

        await expect(page).toHaveURL(new RegExp(`${route}(?:\\?|$)`));
        await expect(postLink).toBeAttached();

        const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const over = rows.filter(
          ([, count]) => count > MAX_PREFETCHES_PER_HREF
        );
        expect(
          over,
          `RSC prefetches during ${IDLE_MS}ms idle: ${JSON.stringify(rows)}`
        ).toEqual([]);
      });
    }
  }
});
