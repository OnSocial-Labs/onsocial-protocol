import { devices, expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Phone feed freeze: stacked post sheets used to restore `overflow: hidden`
 * onto the feed, and a Back during the close animation brought the closed
 * post back underneath the next one.
 */

const pixel = devices['Pixel 7'];

test.use({
  viewport: pixel.viewport,
  userAgent: pixel.userAgent,
  deviceScaleFactor: pixel.deviceScaleFactor,
  isMobile: pixel.isMobile,
  hasTouch: pixel.hasTouch,
});

type GraphBody = {
  query?: string;
  variables?: { parentPath?: string; author?: string; postId?: string };
};

function feedRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  authorName?: string;
  blockHeight?: number;
}) {
  return {
    accountId: opts.accountId,
    postId: opts.postId,
    value: JSON.stringify({ v: 1, text: opts.text }),
    blockHeight: opts.blockHeight ?? 200,
    blockTimestamp: 1_700_000_000,
    receiptId: `receipt-${opts.postId}`,
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
    authorName: opts.authorName ?? 'Alice',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

function replyRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  parentAuthor: string;
  parentPath: string;
}) {
  return {
    replyAuthor: opts.accountId,
    replyId: opts.postId,
    value: JSON.stringify({ v: 1, text: opts.text }),
    blockHeight: 180,
    blockTimestamp: 1_700_000_100,
    groupId: '',
    parentAuthor: opts.parentAuthor,
    parentPath: opts.parentPath,
    parentType: 'post',
  };
}

const ALPHA = {
  accountId: 'alice.near',
  postId: 'alpha-post',
  text: 'Alpha feed post for the scroll lock',
};
const BETA = {
  accountId: 'bob.near',
  postId: 'beta-post',
  text: 'Beta feed post opened after back',
};
const NESTED = {
  accountId: 'cara.near',
  postId: 'nested-reply',
  text: 'Nested reply opened from alpha',
  parentAuthor: ALPHA.accountId,
  parentPath: `${ALPHA.accountId}/post/${ALPHA.postId}`,
};

const FEED = [
  feedRow({ ...ALPHA, authorName: 'Alice', blockHeight: 400 }),
  feedRow({ ...BETA, authorName: 'Bob', blockHeight: 399 }),
  ...Array.from({ length: 22 }, (_, index) =>
    feedRow({
      accountId: 'erin.near',
      postId: `filler-${index}`,
      text: `Filler feed post ${index} so the phone feed can scroll`,
      authorName: 'Erin',
      blockHeight: 398 - index,
    })
  ),
];

function readGraph(route: Route): GraphBody {
  const raw =
    route.request().postData() ??
    route.request().postDataBuffer()?.toString('utf8') ??
    '';
  if (!raw) return { query: route.request().url(), variables: {} };
  try {
    return JSON.parse(raw) as GraphBody;
  } catch {
    return { query: raw, variables: {} };
  }
}

async function stubGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = readGraph(route);
    const query = body.query ?? '';
    const vars = body.variables ?? {};

    if (!route.request().postData() && !route.request().postDataBuffer()) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            postsFeed: FEED,
            postsCurrent: FEED,
            threadReplies: [replyRow(NESTED)],
            threadReplyCounts: [
              { parentPath: NESTED.parentPath, replyCount: 1 },
            ],
            quoteCounts: [],
            repostCounts: [],
          },
        }),
      });
      return;
    }

    if (query.includes('threadReplies')) {
      const parent = vars.parentPath ?? '';
      const replies =
        parent === NESTED.parentPath || parent.includes(ALPHA.postId)
          ? [
              replyRow({
                ...NESTED,
                parentPath: parent || NESTED.parentPath,
              }),
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { threadReplies: replies } }),
      });
      return;
    }

    if (query.includes('threadReplyCounts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            threadReplyCounts: [
              { parentPath: NESTED.parentPath, replyCount: 1 },
            ],
            quoteCounts: [],
            repostCounts: [],
          },
        }),
      });
      return;
    }

    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      if (vars.author) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { [field]: [] } }),
        });
        return;
      }
      if (vars.postId) {
        const row = FEED.find((item) => item.postId === vars.postId);
        const nested =
          vars.postId === NESTED.postId
            ? feedRow({
                accountId: NESTED.accountId,
                postId: NESTED.postId,
                text: NESTED.text,
                authorName: 'Cara',
              })
            : null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { [field]: row ? [row] : nested ? [nested] : [] },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: FEED } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}

async function openFeed(page: Page) {
  await stubGraph(page);
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const feed = page.locator('.home-feed-list');
  await expect(feed.getByText(ALPHA.text).first()).toBeVisible({
    timeout: 20_000,
  });
  return feed;
}

async function tapOpenPost(scope: ReturnType<Page['locator']>) {
  await scope.getByRole('link', { name: 'Open post' }).first().tap();
}

async function moveFeed(
  page: Page,
  feed: ReturnType<Page['locator']>,
  scroller: ReturnType<Page['locator']>
) {
  const before = await scroller.evaluate((node) => ({
    top: node.scrollTop,
    room: node.scrollHeight - node.clientHeight,
  }));
  expect(before.room).toBeGreaterThan(40);
  const box = await scroller.boundingBox();
  if (!box) throw new Error('feed scroller has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.62;
  await page.mouse.move(x, y);
  // Mobile WebKit has no wheel. Pulling a later post into view is refused
  // while the scroller is overflow:hidden, and moves it once the lock is gone.
  if (page.context().browser()?.browserType().name() === 'webkit') {
    await feed.getByText('Filler feed post 12').scrollIntoViewIfNeeded();
  } else {
    await page.mouse.wheel(0, 700);
  }
  await expect
    .poll(async () => scroller.evaluate((node) => node.scrollTop), {
      timeout: 3_000,
    })
    .toBeGreaterThan(before.top + 20);
}

async function inlineHidden(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nodes: HTMLElement[] = [
      document.documentElement,
      ...document.querySelectorAll<HTMLElement>('.os-app-screen-body'),
    ];
    return nodes
      .filter((node) => node.style.overflow === 'hidden')
      .map((node) =>
        node === document.documentElement ? 'html' : node.className
      );
  });
}

test.describe('phone feed scroll lock @webkit', () => {
  test('browser back from stacked posts leaves the feed scrolling', async ({
    page,
  }) => {
    const feed = await openFeed(page);
    await tapOpenPost(feed.locator('article').filter({ hasText: ALPHA.text }));
    const sheet = page.locator('.post-thread-sheet-panel').last();
    await expect(sheet).toContainText(ALPHA.text, { timeout: 15_000 });
    await expect(sheet).toContainText(NESTED.text, { timeout: 15_000 });

    const nested = sheet.locator('.post-thread-item', { hasText: NESTED.text });
    await nested.scrollIntoViewIfNeeded();
    await tapOpenPost(nested);
    await expect(page.locator('.post-thread-sheet-panel')).toHaveCount(2, {
      timeout: 15_000,
    });
    // The phone lock is on while the sheets are up. Closing them must take it off.
    expect(await inlineHidden(page)).toContain('html');

    await page.goBack();
    await expect(page.locator('.post-thread-sheet-panel')).toHaveCount(0, {
      timeout: 5_000,
    });
    expect(await inlineHidden(page)).toEqual([]);

    const scroller = feed.locator(
      'xpath=ancestor::main[contains(@class,"os-app-screen-body")]'
    );
    await moveFeed(page, feed, scroller);
    await expect(feed).toContainText(ALPHA.text);
  });

  test('back then another post does not bring the closed post back', async ({
    page,
  }) => {
    const feed = await openFeed(page);
    await tapOpenPost(feed.locator('article').filter({ hasText: ALPHA.text }));
    await expect(page.locator('.post-thread-sheet-panel')).toContainText(
      ALPHA.text,
      { timeout: 15_000 }
    );

    await page.getByRole('button', { name: 'Back' }).tap();
    await tapOpenPost(feed.locator('article').filter({ hasText: BETA.text }));

    const sheets = page.locator('.post-thread-sheet-panel');
    await expect(sheets.filter({ hasText: BETA.text })).toBeVisible({
      timeout: 15_000,
    });
    await expect(sheets.filter({ hasText: ALPHA.text })).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.locator('.post-thread-sheet-panel')).toHaveCount(0, {
      timeout: 5_000,
    });
    await expect(feed).toContainText(BETA.text);
    expect(await inlineHidden(page)).toEqual([]);
  });

  test('back then quotes does not bring the closed post back', async ({
    page,
  }) => {
    const feed = await openFeed(page);
    await tapOpenPost(feed.locator('article').filter({ hasText: ALPHA.text }));
    const sheet = page.locator('.post-thread-sheet-panel').last();
    await expect(sheet).toContainText(ALPHA.text, { timeout: 15_000 });
    const quotes = sheet.locator('.thread-view-quotes');
    await expect(quotes).toBeAttached();

    await page.getByRole('button', { name: 'Back' }).tap();
    await quotes.dispatchEvent('click');

    await expect(
      page.locator('.os-app-screen-title', { hasText: 'Post reach' })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.post-thread-sheet-panel')).toHaveCount(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.locator('.post-thread-sheet-panel')).toHaveCount(0, {
      timeout: 5_000,
    });
  });
});
