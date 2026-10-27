import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import {
  GUILD_E2E_FEED_ROWS,
  GUILD_E2E_FEED_TEXT,
  GUILD_E2E_ID,
  GUILD_E2E_PATH,
  stubGuildPage,
} from './helpers/guild-page';

/*
 * Perceived-performance contract for guild feed → thread, mirroring
 * thread-open-perceived.spec.ts for personal threads:
 * 1. The tapped post paints instantly with the counts the feed card showed.
 * 2. Skeleton reply rows hold the reply slot while the tree is in flight —
 *    the "More from …" discover peek must never flash in and be replaced.
 * 3. Re-opening a thread this session paints replies from the session cache
 *    (stale-while-revalidate) even when the network is slow.
 */

const ROOT_AUTHOR = 'alice.testnet';
const ROOT_POST_ID = 'guild-loading';
const ROOT_PATH = `${ROOT_AUTHOR}/groups/${GUILD_E2E_ID}/content/post/${ROOT_POST_ID}`;

const REPLY = {
  accountId: 'bob.testnet',
  postId: 'guild-reply-one',
  text: 'First guild reply from Bob',
};

const PEEK = {
  accountId: ROOT_AUTHOR,
  postId: 'guild-peek-post',
  text: 'Another Alice guild-era post used by the discover peek',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

/** `query GroupPost` selection — POST_ROW_FIELDS for the thread root. */
function guildRootRow() {
  return {
    accountId: ROOT_AUTHOR,
    postId: ROOT_POST_ID,
    value: JSON.stringify({ v: 1, text: GUILD_E2E_FEED_TEXT }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: 'receipt-guild-root',
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: 'post',
    audiences: '',
    groupId: GUILD_E2E_ID,
    isGroupContent: true,
  };
}

/** Reply row shape returned by the `RepliesByPath` threadReplies query. */
function replyRow() {
  return {
    replyAuthor: REPLY.accountId,
    replyId: REPLY.postId,
    value: JSON.stringify({ v: 1, text: REPLY.text }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_001,
    groupId: GUILD_E2E_ID,
    parentAuthor: ROOT_AUTHOR,
    parentPath: ROOT_PATH,
    parentType: 'post',
  };
}

/** Personal-feed row (`query Posts`) the discover peek offers. */
function peekRow() {
  return {
    accountId: PEEK.accountId,
    postId: PEEK.postId,
    value: JSON.stringify({ v: 1, text: PEEK.text }),
    blockHeight: 201,
    blockTimestamp: 1_700_000_002,
    receiptId: `receipt-${PEEK.postId}`,
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

/**
 * Layered over `stubGuildPage`: answers the thread queries the helper does
 * not know (root post, reply tree, quotes, counts, discover-peek feed) and
 * falls back to the helper for everything else.
 */
async function stubGuildThreadGraph(
  page: Page,
  opts: {
    replies?: boolean;
    treeDelayMs: () => number;
    countsDelayMs?: number;
    peekDelayMs?: number;
  }
): Promise<void> {
  const withReplies = opts.replies ?? true;
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
      variables?: { parentPath?: string; author?: string };
    };
    const query = body.query ?? '';
    const vars = body.variables ?? {};

    // Background refresh keeps the painted thread only when the root
    // re-resolves — without this the reply tree never applies.
    if (query.includes('query GroupPost(')) {
      await route.fulfill(json({ data: { postsCurrent: [guildRootRow()] } }));
      return;
    }

    if (query.includes('RepliesByPath')) {
      await sleep(opts.treeDelayMs());
      const replies =
        withReplies && vars.parentPath === ROOT_PATH ? [replyRow()] : [];
      await route.fulfill(json({ data: { threadReplies: replies } }));
      return;
    }

    if (query.includes('QuotesByPath')) {
      await route.fulfill(json({ data: { quotes: [] } }));
      return;
    }

    if (query.includes('threadReplyCounts')) {
      if (opts.countsDelayMs) await sleep(opts.countsDelayMs);
      await route.fulfill(
        json({
          data: {
            threadReplyCounts: [{ parentPath: ROOT_PATH, replyCount: 1 }],
            quoteCounts: [],
            repostCounts: [],
          },
        })
      );
      return;
    }

    // Discover peek — feed.recent({ author }) offers a different post.
    if (query.includes('query Posts(') && vars.author === ROOT_AUTHOR) {
      await sleep(opts.peekDelayMs ?? 250);
      await route.fulfill(json({ data: { postsFeed: [peekRow()] } }));
      return;
    }

    await route.fallback();
  });
}

async function gotoGuildFeedWithRoot(page: Page) {
  await gotoApp(page, GUILD_E2E_PATH);
  await dismissNextDevOverlay(page);
  const feed = page.locator('.home-feed-list');
  await expect(feed).toContainText(GUILD_E2E_FEED_TEXT, { timeout: 20_000 });
}

async function openThreadFromFeed(page: Page) {
  const feed = page.locator('.home-feed-list');
  await feed.getByRole('link', { name: 'Open post' }).first().click();
  const layer = page.locator('.post-thread-sheet-panel');
  await expect(layer).toBeVisible({ timeout: 15_000 });
  return layer;
}

test('skeleton rows hold the reply slot while the tree loads — the discover peek never flashes', async ({
  page,
}) => {
  await stubGuildPage(page, { feedRows: GUILD_E2E_FEED_ROWS });
  await stubGuildThreadGraph(page, { treeDelayMs: () => 1_500 });
  await gotoGuildFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);

  // Loading window: reply-shaped skeletons, and the peek stays unmounted
  // even though its own fetch would resolve sooner (250ms < 900ms).
  await expect(layer.locator('.post-row-skeleton-list')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(layer.locator('.thread-discover-peek')).toHaveCount(0);

  // Resolved: skeletons out, replies in, still no peek swap.
  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 15_000 });
  await expect(layer.locator('.post-row-skeleton-list')).toHaveCount(0);
  await expect(layer.locator('.thread-discover-peek')).toHaveCount(0);
});

test('the opened post keeps the counts the feed card showed — no zero flash', async ({
  page,
}) => {
  await stubGuildPage(page, { feedRows: GUILD_E2E_FEED_ROWS });
  await stubGuildThreadGraph(page, {
    treeDelayMs: () => 800,
    countsDelayMs: 1_500,
  });
  await gotoGuildFeedWithRoot(page);
  const feedCard = page
    .locator('.home-feed-list article')
    .filter({ hasText: GUILD_E2E_FEED_TEXT })
    .first();
  // The card only hands over what it shows — wait for its own count first.
  // A disconnected guild feed card has no reply button, but the stat slot
  // still renders the count.
  await expect(feedCard.locator('.post-card-stat--reply')).toContainText('1', {
    timeout: 15_000,
  });

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
  await stubGuildPage(page, { feedRows: GUILD_E2E_FEED_ROWS });
  await stubGuildThreadGraph(page, { treeDelayMs: () => treeDelay });
  await gotoGuildFeedWithRoot(page);
  let layer = await openThreadFromFeed(page);
  await expect(layer.getByText(REPLY.text)).toBeVisible({ timeout: 15_000 });

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
  await stubGuildPage(page, { feedRows: GUILD_E2E_FEED_ROWS });
  await stubGuildThreadGraph(page, { replies: false, treeDelayMs: () => 1_200 });
  await gotoGuildFeedWithRoot(page);
  const layer = await openThreadFromFeed(page);

  await expect(layer.locator('.post-row-skeleton-list')).toBeVisible();
  await expect(layer.locator('.thread-discover-peek')).toHaveCount(0);

  // Resolved and empty: the peek is the empty state, not a loading artifact.
  await expect(layer.locator('.thread-discover-peek')).toBeVisible({
    timeout: 15_000,
  });
  await expect(layer.locator('.post-row-skeleton-list')).toHaveCount(0);
});
