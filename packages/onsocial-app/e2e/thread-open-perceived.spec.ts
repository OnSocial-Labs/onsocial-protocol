import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/*
 * Perceived-performance contract for feed → thread:
 * 1. The tapped post paints at once with the counts the feed card showed.
 * 2. Replies skeleton underneath until the first page. The discover peek
 *    never flashes in that window.
 * 3. Re-opening a thread this session paints replies from the session cache
 *    (stale-while-revalidate) even when the network is slow.
 */

type GraphBody = {
  query?: string;
  variables?: { parentPath?: string; author?: string; postId?: string };
};

function feedRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  authorName?: string;
}) {
  return {
    accountId: opts.accountId,
    postId: opts.postId,
    value: JSON.stringify({ v: 1, text: opts.text }),
    blockHeight: 200,
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
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    groupId: '',
    parentAuthor: opts.parentAuthor,
    parentPath: opts.parentPath,
    parentType: 'post',
  };
}

const ROOT = {
  accountId: 'alice.near',
  postId: 'root-post',
  text: 'Root post for perceived performance',
};
const PEEK = {
  accountId: 'alice.near',
  postId: 'peek-post',
  text: 'Another Alice post used by the discover peek',
};
const REPLY = {
  accountId: 'bob.near',
  postId: 'reply-one',
  text: 'First reply from Bob',
  parentAuthor: 'alice.near',
  parentPath: 'alice.near/post/root-post',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ControlSeat = { row: number; root: number; dock: number };

async function controlSeat(page: Page): Promise<ControlSeat> {
  return page.evaluate(() => {
    const row = document.querySelector(
      '.post-thread-sheet-panel .guild-thread-column .thread-controls-row'
    );
    const root = document.querySelector(
      '.post-thread-sheet-panel .guild-thread-root'
    );
    const dock = document.querySelector('.portfolio-summon-dock');
    if (
      !(row instanceof HTMLElement) ||
      !(root instanceof HTMLElement) ||
      !(dock instanceof HTMLElement)
    ) {
      throw new Error('controls seat is missing');
    }
    return {
      row: row.getBoundingClientRect().height,
      root: root.getBoundingClientRect().top,
      dock: dock.getBoundingClientRect().top,
    };
  });
}

function expectSeatStable(before: ControlSeat, after: ControlSeat) {
  const delta = {
    row: Math.abs(after.row - before.row),
    root: Math.abs(after.root - before.root),
    dock: Math.abs(after.dock - before.dock),
  };
  const detail = JSON.stringify(delta);
  expect.soft(delta.row, detail).toBeLessThan(1);
  expect.soft(delta.root, detail).toBeLessThan(1);
  expect.soft(delta.dock, detail).toBeLessThan(1);
}

async function labelMotion(page: Page) {
  return page.evaluate(() => {
    const button = document.querySelector(
      '.post-thread-sheet-panel .thread-replies-sort'
    );
    const seat = button?.parentElement;
    if (!(seat instanceof HTMLElement)) return { name: 'none', opacity: '0' };
    const style = getComputedStyle(seat);
    return { name: style.animationName, opacity: style.opacity };
  });
}

async function stubGraph(
  page: Page,
  opts: {
    replies?: boolean;
    treeDelayMs: () => number;
    /** Nested reply queries. Defaults to the root delay. */
    childDelayMs?: () => number;
    countsDelayMs?: number;
  }
): Promise<void> {
  const withReplies = opts.replies ?? true;
  const childDelayMs = opts.childDelayMs ?? opts.treeDelayMs;
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    const vars = body.variables ?? {};

    if (query.includes('threadVisibleReplies')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            threadVisibleReplies: [
              replyRow({
                accountId: 'alice.near',
                postId: 'line-one',
                text: 'Alice answered on the line',
                parentAuthor: 'bob.near',
                parentPath: 'bob.near/post/reply-one',
              }),
            ],
          },
        }),
      });
      return;
    }

    if (query.includes('threadReplies')) {
      const nested = vars.parentPath && vars.parentPath !== REPLY.parentPath;
      await sleep(nested ? childDelayMs() : opts.treeDelayMs());
      const replies =
        withReplies && vars.parentPath === REPLY.parentPath
          ? [replyRow(REPLY)]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { threadReplies: replies } }),
      });
      return;
    }

    if (query.includes('threadReplyCounts')) {
      if (opts.countsDelayMs) await sleep(opts.countsDelayMs);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            threadReplyCounts: [
              { parentPath: REPLY.parentPath, replyCount: 1 },
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
      // Thread root fetch — the opened post itself.
      if (vars.postId === ROOT.postId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { [field]: [feedRow(ROOT)] } }),
        });
        return;
      }
      // Discover peek — feed.recent({ author }) offers a different post.
      if (vars.author === ROOT.accountId) {
        await sleep(250);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { [field]: [feedRow(PEEK)] } }),
        });
        return;
      }
      if (vars.postId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { [field]: [] } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [feedRow(ROOT)] } }),
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

async function gotoFeedWithRoot(page: Page) {
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const feed = page.locator('.home-feed-list');
  await feed.getByText(ROOT.text).first().waitFor({
    state: 'visible',
    timeout: 20_000,
  });
}

async function openThreadFromFeed(page: Page) {
  const feed = page.locator('.home-feed-list');
  const card = feed.locator('article').filter({ hasText: ROOT.text }).first();
  await card
    .getByRole('link', { name: 'Open post' })
    .first()
    .dispatchEvent('click');
  const layer = page.locator('.post-thread-sheet-panel');
  await expect(layer).toBeVisible({ timeout: 10_000 });
  return layer;
}

test('direct replies paint while nested reply queries are still in flight', async ({
  page,
}) => {
  await stubGraph(page, {
    treeDelayMs: () => 200,
    childDelayMs: () => 8_000,
  });
  await gotoFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);
  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 3_000 });
});

test('the reply under a direct reply paints before nested queries finish', async ({
  page,
}) => {
  await stubGraph(page, {
    treeDelayMs: () => 200,
    childDelayMs: () => 8_000,
  });
  await gotoFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);
  await expect(layer.getByText('Alice answered on the line')).toBeVisible({
    timeout: 3_000,
  });
});

test('a seeded post stays visible while replies load', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await stubGraph(page, { treeDelayMs: () => 2_500 });
  await gotoFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);
  const root = layer.locator('.guild-thread-root');

  await expect(root.getByText(ROOT.text)).toBeVisible({ timeout: 3_000 });
  await expect(layer.getByText(REPLY.text)).toHaveCount(0);
  await expect(layer.locator('.os-page-body-appear.is-ready')).toBeVisible();
  await expect(
    layer.locator('.post-card--skeleton.post-card--detail')
  ).toHaveCount(0);
  // Empty-tail peek owns the seat while the first reply page is in flight.
  await expect(layer.locator('.thread-discover-peek.is-pending')).toBeVisible();
  await expect(
    layer.locator('.thread-discover-peek.is-pending .post-row-skeleton-list')
  ).toBeVisible();
  const labelWhileLoading = await layer
    .getByRole('button', { name: 'Sort replies' })
    .count();
  const quotesWhileLoading = await layer
    .getByRole('link', { name: /View quotes|View reposts/ })
    .count();
  const seatWhileLoading = await controlSeat(page);

  const skeletonTop = await layer
    .locator('.thread-discover-peek.is-pending .post-card--skeleton')
    .first()
    .evaluate((node) => node.getBoundingClientRect().top);
  const rootTop = await layer
    .locator('.guild-thread-root .post-identity-name')
    .evaluate((node) => node.getBoundingClientRect().top);

  await root.evaluate((node) => {
    node.setAttribute('data-open-node', 'root');
  });

  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 10_000 });
  const replyTop = await layer
    .locator('.guild-connected-stack article.post-card')
    .first()
    .evaluate((node) => node.getBoundingClientRect().top);
  const rootTopAfter = await layer
    .locator('.guild-thread-root .post-identity-name')
    .evaluate((node) => node.getBoundingClientRect().top);
  expect(Math.abs(replyTop - skeletonTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(rootTopAfter - rootTop)).toBeLessThan(1);
  expect.soft(labelWhileLoading).toBe(0);
  expect.soft(quotesWhileLoading).toBe(0);
  expectSeatStable(seatWhileLoading, await controlSeat(page));
  await expect(
    layer.getByRole('button', { name: 'Sort replies' })
  ).toBeVisible();
  expect.soft((await labelMotion(page)).name).toBe('glass-sheet-appear');
  await expect(root).toHaveAttribute('data-open-node', 'root');
  await expect(root).toHaveJSProperty('tagName', 'DIV');
  await expect(
    layer.locator('.guild-connected-stack .post-row-skeleton-list')
  ).toHaveCount(0);
  await expect(layer.locator('.thread-discover-peek')).toHaveCount(0);
});

test('the opened post keeps the counts the feed card showed — no zero flash', async ({
  page,
}) => {
  await stubGraph(page, { treeDelayMs: () => 800, countsDelayMs: 1_500 });
  await gotoFeedWithRoot(page);
  const feedCard = page
    .locator('.home-feed-list article')
    .filter({ hasText: ROOT.text })
    .first();
  // The card only hands over what it shows — wait for its own count first.
  await expect(
    feedCard.getByRole('button', { name: 'Reply to this post' })
  ).toContainText('1', { timeout: 10_000 });

  const layer = await openThreadFromFeed(page);
  // Counts are still 1.5s out over the network; the seeded row already shows 1.
  const rootReplyStat = layer
    .locator('.guild-thread-root')
    .getByRole('button', { name: 'Reply to this post' });
  await expect(rootReplyStat).toContainText('1');
  await page.waitForTimeout(400);
  await expect(rootReplyStat).toContainText('1');
});

test('re-opening a thread paints replies instantly from the session cache', async ({
  page,
}) => {
  let treeDelay = 150;
  await stubGraph(page, { treeDelayMs: () => treeDelay });
  await gotoFeedWithRoot(page);
  let layer = await openThreadFromFeed(page);
  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 10_000 });

  // Network degrades; the cached tree must still paint immediately.
  treeDelay = 8_000;
  await layer.getByRole('button', { name: 'Back' }).first().click();
  await expect(layer).toHaveCount(0, { timeout: 8_000 });

  layer = await openThreadFromFeed(page);
  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 2_000 });
});

test('an empty thread shows the root while replies load, then the discover peek', async ({
  page,
}) => {
  await stubGraph(page, { replies: false, treeDelayMs: () => 2_500 });
  await gotoFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);

  await expect(layer.getByText(ROOT.text)).toBeVisible({ timeout: 3_000 });
  await expect(layer.locator('.os-page-body-appear.is-ready')).toBeVisible();
  await expect(layer.locator('.thread-discover-peek.is-pending')).toBeVisible();
  const labelWhileLoading = await layer
    .getByRole('button', { name: 'Sort replies' })
    .count();
  const quotesWhileLoading = await layer
    .getByRole('link', { name: /View quotes|View reposts/ })
    .count();
  const seatWhileLoading = await controlSeat(page);

  // Resolved and empty: the peek is the empty state, not a loading artifact.
  await expect(layer.locator('.thread-discover-peek-title')).toBeVisible({
    timeout: 10_000,
  });
  await expect(layer.locator('.thread-discover-peek.is-pending')).toHaveCount(0);
  await expect(layer.locator('.os-page-body-appear.is-ready')).toBeVisible();
  await expect(
    layer.locator('.thread-discover-peek .post-row-skeleton-list')
  ).toHaveCount(0);
  expect.soft(labelWhileLoading).toBe(0);
  expect.soft(quotesWhileLoading).toBe(0);
  expectSeatStable(seatWhileLoading, await controlSeat(page));
  expect
    .soft(await layer.getByRole('button', { name: 'Sort replies' }).count())
    .toBe(0);
  expect
    .soft(
      await layer
        .getByRole('link', { name: /View quotes|View reposts/ })
        .count()
    )
    .toBe(0);
});

test('a replies label does not animate when motion is reduced', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubGraph(page, { treeDelayMs: () => 2_500 });
  await gotoFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);

  await expect(layer.getByText(ROOT.text)).toBeVisible({ timeout: 3_000 });
  const labelWhileLoading = await layer
    .getByRole('button', { name: 'Sort replies' })
    .count();
  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 10_000 });
  await expect(
    layer.getByRole('button', { name: 'Sort replies' })
  ).toBeVisible();
  expect.soft(labelWhileLoading).toBe(0);
  const motion = await labelMotion(page);
  expect(motion.name).toBe('none');
  expect(Number(motion.opacity)).toBe(1);
});

test('a deep-linked reply scrolls into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubGraph(page, { treeDelayMs: () => 0 });
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    const vars = body.variables ?? {};
    if (
      query.includes('threadReplies') &&
      vars.parentPath === REPLY.parentPath
    ) {
      const replies = Array.from({ length: 14 }, (_, index) =>
        replyRow({
          accountId: 'bob.near',
          postId: index === 13 ? 'reply-deep' : `pad-${index}`,
          text:
            index === 13
              ? 'Deep linked reply'
              : `Padding reply ${index} ${'line '.repeat(12)}`,
          parentAuthor: 'alice.near',
          parentPath: REPLY.parentPath,
        })
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { threadReplies: replies } }),
      });
      return;
    }
    await route.fallback();
  });

  await gotoApp(page, '/@alice.near/posts/root-post?reply=reply-deep');
  await dismissNextDevOverlay(page);
  const target = page.locator('[data-thread-focus-reply="reply-deep"]');
  await expect(target).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox();
        const view = page.viewportSize();
        if (!box || !view) return false;
        return box.y >= 0 && box.y + box.height <= view.height;
      },
      { timeout: 20_000 }
    )
    .toBe(true);
});

test('back from a thread restores the feed scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubGraph(page, { treeDelayMs: () => 0 });
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    const vars = body.variables ?? {};
    if (
      (query.includes('postsFeed') || query.includes('postsCurrent')) &&
      !vars.postId &&
      vars.author !== ROOT.accountId
    ) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      const rows = [
        feedRow(ROOT),
        ...Array.from({ length: 16 }, (_, index) =>
          feedRow({
            accountId: 'bob.near',
            postId: `pad-${index}`,
            text: `Feed pad ${index} ${'line '.repeat(10)}`,
          })
        ),
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: rows } }),
      });
      return;
    }
    await route.fallback();
  });

  await gotoFeedWithRoot(page);
  const scroller = page.locator('.os-app-screen-body').first();
  await scroller.evaluate((node) => {
    node.scrollTop = 480;
  });
  const before = await scroller.evaluate((node) => node.scrollTop);
  expect(before).toBeGreaterThan(200);

  await openThreadFromFeed(page);
  await page
    .locator('.post-thread-sheet-panel')
    .getByRole('button', { name: 'Back' })
    .click();
  await expect(
    page.locator('.home-feed-list').getByText(ROOT.text).first()
  ).toBeVisible();
  await expect
    .poll(async () => scroller.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(200);
});
