import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import {
  GUILD_E2E_ID,
  GUILD_E2E_PATH,
  stubGuildPage,
} from './helpers/guild-page';

/**
 * Guild feed windowing — the guild feed renders the same FeedThreadBlock
 * rows as the home feed, so it shares the feed-window core: past the row
 * threshold (30), far blocks collapse into spacer divs and rematerialize
 * on scroll back. Two stubbed pages (24 + 24 roots) cross it.
 *
 * Layered over `stubGuildPage`: this route answers the paged feed query
 * (GroupFeed / FilteredGroupFeed) and the per-card quote/reply look-ups,
 * and falls back to the helper for everything else.
 */

const AUTHOR = 'alice.testnet';

/** `query GroupFeed` row — POST_ROW_FIELDS for a flat guild root. */
function guildFeedRow(index: number) {
  const postId = `gwin-${String(index).padStart(2, '0')}`;
  return {
    accountId: AUTHOR,
    postId,
    value: JSON.stringify({ v: 1, text: `Guild window row ${postId}` }),
    blockHeight: 200 + index,
    blockTimestamp: 1_700_000_000 + index,
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
    groupId: GUILD_E2E_ID,
    isGroupContent: true,
  };
}

const PAGE_ONE = Array.from({ length: 24 }, (_, index) => guildFeedRow(index));
const PAGE_TWO = Array.from({ length: 24 }, (_, index) =>
  guildFeedRow(index + 24)
);

function json(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

async function stubGuildFeedPaging(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
      variables?: { offset?: number };
    };
    const query = body.query ?? '';

    // The app pages with limit 20 and offset = posts held so far; rows ≥
    // limit keeps nextOffset defined, an empty page ends pagination.
    if (query.includes('GroupFeed')) {
      const offset = body.variables?.offset ?? 0;
      const rows = offset === 0 ? PAGE_ONE : offset === 24 ? PAGE_TWO : [];
      await route.fulfill(json({ data: { postsCurrent: rows } }));
      return;
    }

    if (query.includes('RepliesByPath')) {
      await route.fulfill(json({ data: { threadReplies: [] } }));
      return;
    }

    if (query.includes('QuotesByPath')) {
      await route.fulfill(json({ data: { quotes: [] } }));
      return;
    }

    await route.fallback();
  });
}

function scrollGuildFeedTo(page: Page, position: 'top' | 'bottom') {
  return page.locator('.os-app-screen-body').evaluate((node, at) => {
    node.scrollTop = at === 'bottom' ? node.scrollHeight : 0;
  }, position);
}

async function renderedBlockCount(page: Page): Promise<number> {
  return page.locator('.home-feed-block').count();
}

test.describe('guild feed windowing', () => {
  test('far blocks collapse to spacers and rematerialize on scroll back', async ({
    page,
  }) => {
    // SSR-miss path: no catalog cookie, so the feed hydrates through the
    // browser routes (an SSR-painted guild would trust the unstubbable
    // server feed fetch and never refetch client-side).
    await stubGuildPage(page);
    await stubGuildFeedPaging(page);
    await gotoApp(page, GUILD_E2E_PATH);
    await dismissNextDevOverlay(page);

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Guild window row gwin-00', {
      timeout: 15_000,
    });

    // One page (24 blocks) stays fully rendered — under the threshold.
    await expect(page.locator('.home-feed-block')).toHaveCount(24);
    await expect(page.locator('[data-feed-window-spacer]')).toHaveCount(0);

    // Page two appends at the bottom — 48 blocks crosses the threshold.
    // The first scroll lands mid-list once the append grows the page, so
    // scroll twice: the second pass reaches the true bottom.
    await scrollGuildFeedTo(page, 'bottom');
    await expect(feed).toContainText('Guild window row gwin-30', {
      timeout: 15_000,
    });
    await scrollGuildFeedTo(page, 'bottom');
    await expect(feed).toContainText('Guild window row gwin-47', {
      timeout: 15_000,
    });

    // Windowed: the DOM holds only the blocks near the viewport.
    await expect
      .poll(() => renderedBlockCount(page), { timeout: 15_000 })
      .toBeLessThan(48);
    await expect(page.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );
    const headKey = `${AUTHOR}:gwin-00`;
    await expect(
      page.locator(`.home-feed-block[data-feed-key="${headKey}"]`)
    ).toHaveCount(0);

    // Scroll back up — the head block rematerializes with its content.
    await scrollGuildFeedTo(page, 'top');
    const headBlock = page.locator(
      `.home-feed-block[data-feed-key="${headKey}"]`
    );
    await expect(headBlock).toBeVisible({ timeout: 10_000 });
    await expect(headBlock).toContainText('Guild window row gwin-00');
    await expect
      .poll(() => renderedBlockCount(page), { timeout: 15_000 })
      .toBeLessThan(48);
    await expect(
      page.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
  });
});
