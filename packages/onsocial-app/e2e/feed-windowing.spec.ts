import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Feed list windowing — once the block count passes the threshold, far rows
 * collapse into spacer divs so the DOM stays flat no matter how deep the
 * feed gets. Scrolling back materializes the rows again. Two stubbed pages
 * (48 text posts) are enough to cross it.
 */

function feedRow(index: number) {
  const postId = `win-${String(index).padStart(2, '0')}`;
  return {
    accountId: 'alice.near',
    postId,
    value: JSON.stringify({ v: 1, text: `Window row ${postId}` }),
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

const PAGE_ONE = Array.from({ length: 24 }, (_, index) => feedRow(index));
const PAGE_TWO = Array.from({ length: 24 }, (_, index) => feedRow(index + 24));

async function stubPagedFeedGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
      variables?: { offset?: number };
    };
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed')
        ? 'postsFeed'
        : 'postsCurrent';
      const offset = body.variables?.offset ?? 0;
      const rows = offset === 0 ? PAGE_ONE : offset === 24 ? PAGE_TWO : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: rows } }),
      });
      return;
    }
    if (query.includes('threadReplies')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { threadReplies: [] } }),
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

function scrollFeedTo(page: Page, position: 'top' | 'bottom') {
  return page
    .locator('.os-app-screen-body')
    .evaluate((node, at) => {
      node.scrollTop = at === 'bottom' ? node.scrollHeight : 0;
    }, position);
}

async function renderedBlockCount(page: Page): Promise<number> {
  return page.locator('.home-feed-block').count();
}

test.describe('feed list windowing', () => {
  test('far rows collapse to spacers and rematerialize on scroll back', async ({
    page,
  }) => {
    await stubPagedFeedGraph(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Window row win-00');

    // One page (24 blocks) stays fully rendered — under the threshold.
    await expect(page.locator('.home-feed-block')).toHaveCount(24);
    await expect(page.locator('[data-feed-window-spacer]')).toHaveCount(0);

    // Page two appends at the bottom — 48 blocks crosses the threshold.
    await scrollFeedTo(page, 'bottom');
    await expect(feed).toContainText('Window row win-47', {
      timeout: 15_000,
    });

    // Windowed: the DOM holds only the rows near the viewport.
    await expect.poll(() => renderedBlockCount(page)).toBeLessThan(48);
    await expect(
      page.locator('[data-feed-window-spacer="top"]')
    ).toHaveCount(1);
    const headKey = 'alice.near:win-00';
    await expect(
      page.locator(`.home-feed-block[data-feed-key="${headKey}"]`)
    ).toHaveCount(0);

    // Scroll back up — the head row rematerializes with its content.
    await scrollFeedTo(page, 'top');
    const headBlock = page.locator(
      `.home-feed-block[data-feed-key="${headKey}"]`
    );
    await expect(headBlock).toBeVisible({ timeout: 10_000 });
    await expect(headBlock).toContainText('Window row win-00');
    await expect.poll(() => renderedBlockCount(page)).toBeLessThan(48);
    await expect(
      page.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
  });
});
