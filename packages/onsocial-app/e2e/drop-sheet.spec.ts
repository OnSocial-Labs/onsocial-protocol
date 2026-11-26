import { devices, expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import {
  collectionPageRoot,
  collectionPageSkeleton,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop, setE2eGraphMarket } from './helpers/e2e-graph';
import { stubMarketLiveFirstBrowse } from './helpers/market-live-first';
import { e2eDropCollectionRow } from '../src/lib/e2e-graph-stubs';

/**
 * In-app drop opens are one sheet. Refresh and a typed URL stay the page.
 * Pixel 7 runs at 4x CPU. WebKit uses iPhone 13. Desktop is Chrome.
 */

const pixel = devices['Pixel 7'];
const iphone = devices['iPhone 13'];

const DROP_ID = 'night-drive';
const DROP_TITLE = 'Night Drive';
const DROP_PATH = `/collection/${DROP_ID}`;
const FEED_TEXT = 'Feed card that opens the drop sheet';

function phoneUse(device: (typeof devices)['Pixel 7']) {
  return {
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  };
}

function feedPost(postId: string, text: string, withDrop: boolean) {
  const value: Record<string, unknown> = { v: 1, text };
  if (withDrop) {
    value.embeds = [
      {
        kind: 'collection',
        chain: 'near',
        contract: 'scarce.onsocial.testnet',
        collectionId: DROP_ID,
      },
    ];
    value.x = {
      onsocial: {
        drop: {
          collectionId: DROP_ID,
          title: DROP_TITLE,
          mediumKind: 'audio',
        },
      },
    };
  }
  return {
    accountId: 'alice.near',
    postId,
    value: JSON.stringify(value),
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
    authorName: 'Alice',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

const FEED_POSTS = [
  feedPost('drop-root', FEED_TEXT, true),
  ...Array.from({ length: 14 }, (_, index) =>
    feedPost(
      `pad-${index}`,
      `Padding post ${index} so the feed can scroll`,
      false
    )
  ),
];

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data }),
  });
}

async function stubFeedGraph(page: Page) {
  const row = e2eDropCollectionRow(DROP_ID);
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = route.request().postDataJSON() as {
      query?: string;
      variables?: Record<string, unknown>;
    };
    const query = body?.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await fulfillJson(route, { [field]: FEED_POSTS });
      return;
    }
    if (query.includes('scarcesCollectionsCurrent')) {
      await fulfillJson(route, { scarcesCollectionsCurrent: [row] });
      return;
    }
    await fulfillJson(route, {});
  });
}

async function stubDiscoverGraph(
  page: Page,
  opts?: { holdCollection?: boolean }
) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let collectionStarted = false;
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = route.request().postDataJSON() as {
      query?: string;
      variables?: { medium?: string; collectionId?: string };
    };
    const query = body?.query ?? '';
    const variables = body?.variables ?? {};
    if (query.includes('DiscoverDrops')) {
      const rows =
        variables.medium === 'audio'
          ? [
              {
                collectionId: DROP_ID,
                title: DROP_TITLE,
                creatorId: 'alice.near',
                mediumKind: 'audio',
                kind: 'audio',
                extraJson: null,
                media: null,
              },
            ]
          : [];
      await fulfillJson(route, { scarcesCollectionsCurrent: rows });
      return;
    }
    if (
      opts?.holdCollection &&
      query.includes('scarcesCollectionsCurrent') &&
      variables.collectionId === DROP_ID
    ) {
      collectionStarted = true;
      await held;
      await fulfillJson(route, {
        scarcesCollectionsCurrent: [e2eDropCollectionRow(DROP_ID)],
      });
      return;
    }
    if (query.includes('postsCurrent') || query.includes('profileSearch')) {
      const field = query.includes('postsCurrent')
        ? 'postsCurrent'
        : 'profileSearch';
      await fulfillJson(route, { [field]: [] });
      return;
    }
    await fulfillJson(route, {});
  });
  return {
    release,
    collectionStarted: () => collectionStarted,
  };
}

async function clearSession(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* private mode */
    }
  });
}

async function feedScroller(page: Page) {
  return page.locator('.os-app-screen-body').first();
}

async function openFeedDrop(page: Page) {
  await clearSession(page);
  await stubFeedGraph(page);
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const card = page.locator('article').filter({ hasText: FEED_TEXT }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const link = card.getByRole('link', { name: 'Drop', exact: true });
  await expect(link).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveAttribute('href', DROP_PATH);
  return { card, link };
}

function dropSheet(page: Page) {
  return page.locator('.drop-sheet-panel');
}

function dock(page: Page) {
  return page.locator('.portfolio-summon-dock');
}

async function installCases(label: string) {
  test.describe(`drop sheet ${label}`, () => {
    test('feed opens a sheet, Back restores scroll, refresh is the page', async ({
      page,
    }) => {
      const { link } = await openFeedDrop(page);
      const scroller = await feedScroller(page);
      await scroller.evaluate((node) => {
        node.setAttribute('data-e2e-feed-scroll', '1');
        node.scrollTop = 480;
      });
      const before = await scroller.evaluate((node) => node.scrollTop);
      expect(before).toBeGreaterThan(40);

      await page.evaluate(() => {
        const mark = () => {
          if (
            document.querySelector(
              '.drop-sheet-panel .collection-title, .drop-sheet-panel .collection-hero'
            )
          ) {
            performance.mark('drop-sheet-paint');
            return true;
          }
          return false;
        };
        (window as unknown as { __dropPaint?: Promise<number> }).__dropPaint =
          new Promise((resolve) => {
            const done = () => {
              performance.mark('drop-sheet-paint');
              resolve(performance.now());
            };
            if (mark()) {
              resolve(performance.now());
              return;
            }
            const observer = new MutationObserver(() => {
              if (mark()) {
                observer.disconnect();
                done();
              }
            });
            observer.observe(document.documentElement, {
              childList: true,
              subtree: true,
            });
          });
      });
      const started = await page.evaluate(() => performance.now());
      // A real click scrolls the link into view and wipes the line on a phone.
      await link.evaluate((el) => {
        el.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          })
        );
      });
      const sheet = dropSheet(page);
      await expect(sheet).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(`${DROP_PATH}$`));
      await expect(sheet.locator('.collection-title')).toContainText(
        DROP_TITLE
      );
      await expect(dock(page)).toBeVisible();
      await expect(dock(page)).toHaveCount(1);
      await expect(
        dock(page).getByRole('button', { name: 'Back', exact: true })
      ).toBeVisible();
      await expect(
        dock(page).getByRole('button', { name: 'Mint', exact: true })
      ).toBeVisible({ timeout: 15_000 });
      const painted = await page.evaluate(
        () =>
          (window as unknown as { __dropPaint: Promise<number> }).__dropPaint
      );
      const openMs = Math.round(painted - started);
      console.log(`DROP_SHEET_OPEN_MS ${label} ${openMs}`);

      await dock(page)
        .getByRole('button', { name: 'Mint', exact: true })
        .click();
      const mint = page.getByRole('dialog', { name: 'Mint' });
      await expect(mint).toBeVisible();
      await mint.getByRole('button', { name: 'Close mint scarce' }).click();
      await expect(mint).toHaveCount(0);

      await dock(page)
        .getByRole('button', { name: 'Back', exact: true })
        .click();
      await expect(sheet).toHaveCount(0);
      await expect(page).not.toHaveURL(/\/collection\//);
      await expect(page.locator('[data-scroll-locked]')).toHaveCount(0);
      await expect
        .poll(
          async () => {
            const top = await page.evaluate(() => {
              const node = document.querySelector('[data-e2e-feed-scroll="1"]');
              return node instanceof HTMLElement ? node.scrollTop : -1;
            });
            return Math.abs(top - before);
          },
          { timeout: 3_000 }
        )
        .toBeLessThan(8);

      await page.goForward();
      await expect(dropSheet(page)).toBeVisible({ timeout: 10_000 });
      await expect(page).toHaveURL(new RegExp(`${DROP_PATH}$`));

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.body.dataset.appHydrated === 'true',
        undefined,
        { timeout: 30_000 }
      );
      await expect(dropSheet(page)).toHaveCount(0);
      await expect(
        collectionPageRoot(page).or(collectionPageSkeleton(page))
      ).toBeVisible({ timeout: 20_000 });
    });

    test('a Market row opens the sheet', async ({ page }) => {
      await setE2eGraphMarket(page, 'live-first');
      await stubMarketLiveFirstBrowse(page);
      await gotoApp(page, '/market');
      const liveRow = page.locator(
        '[data-market-listing-group="live"] .market-listing-row'
      );
      await expect(liveRow).toBeVisible({ timeout: 30_000 });
      await liveRow
        .getByRole('link', { name: 'Open drop for e2e-live-first Live Ask' })
        .click({ position: { x: 12, y: 12 } });
      await expect(dropSheet(page)).toBeVisible();
      await expect(page).toHaveURL(/\/collection\/e2e-live/);
      await expect(
        page.getByRole('textbox', { name: 'Search Market listings' })
      ).toBeAttached();
      await expect(
        dock(page).getByRole('button', { name: 'Back', exact: true })
      ).toBeVisible();
      await dock(page)
        .getByRole('button', { name: 'Back', exact: true })
        .click();
      await expect(dropSheet(page)).toHaveCount(0);
      await expect(page).toHaveURL(/\/market/);
      await expect(page.locator('[data-scroll-locked]')).toHaveCount(0);
    });

    test('a Discover row opens the sheet from the card seed', async ({
      page,
    }) => {
      await clearSession(page);
      const held = await stubDiscoverGraph(page, { holdCollection: true });
      try {
        await gotoApp(page, '/discover');
        await dismissNextDevOverlay(page);
        const search = page.getByRole('textbox', {
          name: 'Search people, articles, books, music, and events',
        });
        await search.fill('night');
        const row = page
          .locator('.discover-catalog-row')
          .filter({ hasText: DROP_TITLE });
        await expect(row).toBeVisible({ timeout: 20_000 });
        const started = Date.now();
        await row.click();
        const sheet = dropSheet(page);
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('.collection-title')).toContainText(
          DROP_TITLE
        );
        await expect(
          sheet.locator('[data-collection-page-skeleton]')
        ).toHaveCount(0);
        await expect(page).toHaveURL(new RegExp(`${DROP_PATH}$`));
        const openMs = Date.now() - started;
        console.log(`DROP_SHEET_COLD_MS ${label} ${openMs}`);
        await expect(
          sheet.locator('[data-collection-page-skeleton]')
        ).toHaveCount(0);
      } finally {
        held.release();
      }
    });

    test('a cold hard load is the full page', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await stubCollectionPageGraph(page, { catalogDelayMs: 1_200 });
      await gotoApp(page, '/collection/quiet-print');
      await expect(dropSheet(page)).toHaveCount(0);
      await expect(collectionPageSkeleton(page)).toBeVisible({
        timeout: 8_000,
      });
      await expect(collectionPageRoot(page)).toBeVisible({ timeout: 15_000 });
      await expect(dropSheet(page)).toHaveCount(0);
    });
  });
}

test.describe('pixel 4x', () => {
  test.use(phoneUse(pixel));
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', '4x profile is Chromium');
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  });
  installCases('pixel-4x');
});

test.describe('iphone @webkit', () => {
  test.use(phoneUse(iphone));
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'webkit', 'iPhone profile runs on WebKit');
  });
  installCases('iphone');
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'desktop profile runs on Chromium');
  });
  installCases('desktop');
});

test('warm drop cookie still has no sheet on a direct load', async ({
  page,
}) => {
  await setE2eGraphDrop(page, 'default');
  await gotoApp(page, DROP_PATH);
  await expect(dropSheet(page)).toHaveCount(0);
  await expect(collectionPageRoot(page)).toBeVisible({ timeout: 20_000 });
});
