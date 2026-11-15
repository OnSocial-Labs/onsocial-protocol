import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS, gotoApp } from './helpers';

/**
 * Background RSC prefetch must settle. A livelock re-requests the same href
 * many times while the page sits idle.
 *
 * CI does not serve live post rows (the graph stub cookie is unset, and the
 * testnet read fails closed). Seed the same browser graph route the other
 * Discover specs use so both widths paint post links.
 */
const IDLE_MS = 15_000;
const MAX_PREFETCHES_PER_HREF = 3;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

const ROUTES = ['/discover', '/home'] as const;

const SEEDED_POSTS = [
  feedPost('alice.testnet', 'idle-a', 'Idle stub one'),
  feedPost('bob.testnet', 'idle-b', 'Idle stub two'),
];

function feedPost(accountId: string, postId: string, text: string) {
  return {
    accountId,
    postId,
    value: JSON.stringify({ v: 1, text }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: `receipt-${postId}`,
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: 'post',
    audiences: '',
    groupId: '',
    isGroupContent: false,
    authorName: accountId,
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 2,
  };
}

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

/** Same graph intercept as the Discover directory specs: fulfill one query, continue the rest. */
async function seedPostLinks(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    let body: { query?: string } = {};
    try {
      body = JSON.parse(route.request().postData() ?? '{}') as { query?: string };
    } catch {
      body = {};
    }
    const query = body.query ?? '';
    if (query.includes('query Posts') && query.includes('postsFeed')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { postsFeed: SEEDED_POSTS } }),
      });
      return;
    }
    await route.continue();
  });
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
        await seedPostLinks(page);
        const counts = trackIdlePrefetches(page);

        await gotoApp(page, route);
        await expect(page.locator('a[href*="/posts/"]').first()).toBeAttached({
          timeout: E2E_CHROME_TIMEOUT_MS,
        });

        counts.clear();
        await page.waitForTimeout(IDLE_MS);

        await expect(page).toHaveURL(new RegExp(`${route}(?:\\?|$)`));
        await expect(page.locator('a[href*="/posts/"]').first()).toBeAttached();

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
