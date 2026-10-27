import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Thread reply windowing — past the row threshold (30), far reply rows in
 * the thread drawer collapse into spacer divs so the DOM stays flat no
 * matter how long the thread gets. Scrolling back rematerializes them.
 * One stubbed thread with 40 flat replies is enough to cross it.
 */

const ROOT_PATH = 'alice.near/post/root-post';
const REPLY_COUNT = 40;

function feedRootRow() {
  return {
    accountId: 'alice.near',
    postId: 'root-post',
    value: JSON.stringify({ v: 1, text: 'Root post' }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: 'receipt-root-post',
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

/** Reply row shape returned by the `RepliesByPath` threadReplies query. */
function replyRow(index: number) {
  const postId = `win-${String(index).padStart(2, '0')}`;
  return {
    replyAuthor: `win-${postId}.near`,
    replyId: postId,
    value: JSON.stringify({ v: 1, text: `Window reply ${postId}` }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000 + index,
    groupId: '',
    parentAuthor: 'alice.near',
    parentPath: ROOT_PATH,
    parentType: 'post',
  };
}

async function stubThreadGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
      variables?: { parentPath?: string };
    };
    const query = body.query ?? '';

    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [feedRootRow()] } }),
      });
      return;
    }

    // Flat thread: every reply hangs off the root; reply paths return none.
    if (query.includes('threadReplies')) {
      const parentPath = body.variables?.parentPath ?? '';
      const replies =
        parentPath === ROOT_PATH
          ? Array.from({ length: REPLY_COUNT }, (_, index) => replyRow(index))
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { threadReplies: replies } }),
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

test.describe('thread reply windowing', () => {
  test('far replies collapse to spacers and rematerialize on scroll back', async ({
    page,
  }) => {
    await stubThreadGraph(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) {
      await globalTab.click();
    }

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Root post');
    await feed.getByRole('link', { name: 'Open post' }).first().click();

    const drawer = page.locator('.post-thread-sheet-panel');
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer).toContainText('Window reply win-00', {
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
    await expect(drawer).toContainText('Window reply win-39', {
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
    await expect(drawer).toContainText('Window reply win-00', {
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
