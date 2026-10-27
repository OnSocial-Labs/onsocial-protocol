import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/*
 * Perceived-performance contract for feed → thread:
 * 1. The tapped post paints instantly with the counts the feed card showed.
 * 2. Skeleton reply rows hold the reply slot while the tree is in flight —
 *    the "More from …" discover peek must never flash in and be replaced.
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

async function stubGraph(
  page: Page,
  opts: {
    replies?: boolean;
    treeDelayMs: () => number;
    countsDelayMs?: number;
  }
): Promise<void> {
  const withReplies = opts.replies ?? true;
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    const vars = body.variables ?? {};

    if (query.includes('threadReplies')) {
      await sleep(opts.treeDelayMs());
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

test('skeleton rows hold the reply slot while the tree loads — the discover peek never flashes', async ({
  page,
}) => {
  await stubGraph(page, { treeDelayMs: () => 1_500 });
  await gotoFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);

  // Loading window: reply-shaped skeletons, and the peek stays unmounted
  // even though its own fetch would resolve sooner (250ms < 1.5s).
  await expect(layer.locator('.post-row-skeleton-list')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(layer.locator('.thread-discover-peek')).toHaveCount(0);

  // Resolved: skeletons out, replies in, still no peek swap.
  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 10_000 });
  await expect(layer.locator('.post-row-skeleton-list')).toHaveCount(0);
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

test('an empty thread swaps skeletons for the discover peek only after loading', async ({
  page,
}) => {
  await stubGraph(page, { replies: false, treeDelayMs: () => 1_200 });
  await gotoFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);

  await expect(layer.locator('.post-row-skeleton-list')).toBeVisible();
  await expect(layer.locator('.thread-discover-peek')).toHaveCount(0);

  // Resolved and empty: the peek is the empty state, not a loading artifact.
  await expect(layer.locator('.thread-discover-peek')).toBeVisible({
    timeout: 10_000,
  });
  await expect(layer.locator('.post-row-skeleton-list')).toHaveCount(0);
});
