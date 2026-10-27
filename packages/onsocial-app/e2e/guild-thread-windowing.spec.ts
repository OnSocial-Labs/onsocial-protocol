import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import {
  GUILD_E2E_FEED_ROWS,
  GUILD_E2E_FEED_TEXT,
  GUILD_E2E_ID,
  GUILD_E2E_PATH,
  stubGuildPage,
} from './helpers/guild-page';

/**
 * Guild thread reply windowing — the drawer shares the feed-window core
 * with personal threads: past the row threshold (30), far reply rows
 * collapse into spacer divs and rematerialize on scroll back. One stubbed
 * guild post with 40 flat replies crosses it.
 *
 * Layered over `stubGuildPage`: this route answers only the thread graph
 * queries the helper does not know (root post, replies, quotes) and falls
 * back to the helper for everything else.
 */

const ROOT_AUTHOR = 'alice.testnet';
const ROOT_POST_ID = 'guild-loading';
const ROOT_PATH = `${ROOT_AUTHOR}/groups/${GUILD_E2E_ID}/content/post/${ROOT_POST_ID}`;
const REPLY_COUNT = 40;

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
function replyRow(index: number) {
  const postId = `win-${String(index).padStart(2, '0')}`;
  return {
    replyAuthor: `win-${postId}.testnet`,
    replyId: postId,
    value: JSON.stringify({ v: 1, text: `Guild window reply ${postId}` }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000 + index,
    groupId: GUILD_E2E_ID,
    parentAuthor: ROOT_AUTHOR,
    parentPath: ROOT_PATH,
    parentType: 'post',
  };
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

async function stubGuildThreadGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
      variables?: { parentPath?: string };
    };
    const query = body.query ?? '';

    // Background refresh keeps the painted thread only when the root
    // re-resolves — without this the reply tree never applies.
    if (query.includes('query GroupPost(')) {
      await route.fulfill(json({ data: { postsCurrent: [guildRootRow()] } }));
      return;
    }

    // Flat thread: every reply hangs off the root; reply paths return none.
    if (query.includes('RepliesByPath')) {
      const parentPath = body.variables?.parentPath ?? '';
      const replies =
        parentPath === ROOT_PATH
          ? Array.from({ length: REPLY_COUNT }, (_, index) => replyRow(index))
          : [];
      await route.fulfill(json({ data: { threadReplies: replies } }));
      return;
    }

    if (query.includes('QuotesByPath')) {
      await route.fulfill(json({ data: { quotes: [] } }));
      return;
    }

    await route.fallback();
  });
}

function scrollThreadTo(page: Page, position: 'top' | 'bottom') {
  return page
    .locator('.post-thread-sheet-panel .os-app-screen-body')
    .evaluate((node, at) => {
      node.scrollTop = at === 'bottom' ? node.scrollHeight : 0;
    }, position);
}

/** Rendered reply items in the drawer (the root has no parent — no items above). */
async function renderedReplyCount(page: Page): Promise<number> {
  return page.locator('.post-thread-sheet-panel .post-thread-item').count();
}

test.describe('guild thread reply windowing', () => {
  test('far replies collapse to spacers and rematerialize on scroll back', async ({
    page,
  }) => {
    // No SSR catalog cookie: an SSR-painted guild trusts the server feed
    // fetch (unstubbable → empty) and never refetches client-side. The
    // SSR-miss path hydrates the feed through the browser routes instead.
    await stubGuildPage(page, { feedRows: GUILD_E2E_FEED_ROWS });
    await stubGuildThreadGraph(page);
    await gotoApp(page, GUILD_E2E_PATH);
    await dismissNextDevOverlay(page);

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText(GUILD_E2E_FEED_TEXT);
    await feed.getByRole('link', { name: 'Open post' }).first().click();

    const drawer = page.locator('.post-thread-sheet-panel');
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer).toContainText('Guild window reply win-00', {
      timeout: 15_000,
    });

    // 40 replies cross the threshold — once the window engages, rows away
    // from the viewport collapse into a bottom spacer.
    await expect
      .poll(() => renderedReplyCount(page), { timeout: 15_000 })
      .toBeLessThan(REPLY_COUNT);
    await expect(
      drawer.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
    await expect(drawer.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      0
    );

    // Deep scroll — the tail row materializes, head rows collapse. The first
    // pass can land mid-list as spacers settle, so scroll twice.
    await scrollThreadTo(page, 'bottom');
    await expect(drawer).toContainText('Guild window reply win-39', {
      timeout: 15_000,
    });
    await scrollThreadTo(page, 'bottom');
    await expect(drawer.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );
    await expect
      .poll(() => renderedReplyCount(page), { timeout: 15_000 })
      .toBeLessThan(REPLY_COUNT);

    // Scroll back — the head row rematerializes with its content.
    await scrollThreadTo(page, 'top');
    await expect(drawer).toContainText('Guild window reply win-00', {
      timeout: 10_000,
    });
    await expect
      .poll(() => renderedReplyCount(page), { timeout: 15_000 })
      .toBeLessThan(REPLY_COUNT);
    await expect(
      drawer.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
  });
});
