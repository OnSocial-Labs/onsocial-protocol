import { expect, test, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

type GraphBody = {
  query?: string;
  variables?: { offset?: number };
};

function feedRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  parentAuthor?: string;
  parentPath?: string;
  authorName?: string;
}) {
  return {
    accountId: opts.accountId,
    postId: opts.postId,
    value: JSON.stringify({ v: 1, text: opts.text }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: `receipt-${opts.postId}`,
    parentPath: opts.parentPath ?? '',
    parentAuthor: opts.parentAuthor ?? '',
    parentType: opts.parentPath ? 'post' : '',
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

function graphField(query: string): 'postsFeed' | 'postsCurrent' | null {
  if (query.includes('postsFeed')) return 'postsFeed';
  if (query.includes('postsCurrent')) return 'postsCurrent';
  return null;
}

/** Reply row shape returned by the `RepliesByPath` threadReplies query. */
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
  text: 'Root post',
  authorName: 'Alice',
};
const REPLY_ONE = {
  accountId: 'bob.near',
  postId: 'reply-one',
  text: 'First reply from Bob',
  parentAuthor: 'alice.near',
  parentPath: 'alice.near/post/root-post',
  authorName: 'Bob',
};
const REPLY_TWO = {
  accountId: 'cara.near',
  postId: 'reply-two',
  text: 'Second reply from Cara',
  parentAuthor: 'alice.near',
  parentPath: 'alice.near/post/root-post',
  authorName: 'Cara',
};

/**
 * Open the thread drawer from a feed post, then Reply inside the drawer points
 * the write dock at that reply (chip + focus) without losing the feed behind it.
 */
test.describe('thread reply dock', () => {
  test('drawer opens with replies, reply Reply focuses dock with chip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.route('**/api/onapi/graph/query', async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const query = body.query ?? '';
      const field = graphField(query);

      // Feed list — root post only.
      if (field) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { [field]: [feedRow(ROOT)] } }),
        });
        return;
      }

      // Thread tree — replies under the root. The tree is built recursively:
      // the root path returns both replies, each reply's own path returns none.
      if (query.includes('threadReplies')) {
        const parentPath =
          (route.request().postDataJSON() as GraphBody & {
            variables?: { parentPath?: string };
          }).variables?.parentPath ?? '';
        const replies =
          parentPath === 'alice.near/post/root-post'
            ? [
                replyRow({
                  accountId: REPLY_ONE.accountId,
                  postId: REPLY_ONE.postId,
                  text: REPLY_ONE.text,
                  parentAuthor: REPLY_ONE.parentAuthor,
                  parentPath: REPLY_ONE.parentPath,
                }),
                replyRow({
                  accountId: REPLY_TWO.accountId,
                  postId: REPLY_TWO.postId,
                  text: REPLY_TWO.text,
                  parentAuthor: REPLY_TWO.parentAuthor,
                  parentPath: REPLY_TWO.parentPath,
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

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: {} }),
      });
    });

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Root post');

    // Open the thread drawer from the post link (Open post / timestamp).
    await feed.getByRole('link', { name: 'Open post' }).first().click();

    // The drawer shows the seeded root immediately, then loads replies.
    const drawer = page.locator('.post-thread-sheet-panel');
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer).toContainText('Root post');
    await expect(drawer).toContainText('First reply from Bob', {
      timeout: 15_000,
    });
    await expect(drawer).toContainText('Second reply from Cara');

    // Click Reply on Bob's reply inside the drawer.
    await drawer
      .getByRole('button', { name: 'Reply to this post' })
      .nth(1)
      .click();

    // The write dock points at Bob with the reply chip and is focused.
    const chip = page.locator('.os-write-dock-reply');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText('Replying');
    await expect(chip).toContainText('Bob');

    // The reply target is the nested reply, not the root.
    await expect(
      page.locator('[data-thread-opened-post="root-post"]')
    ).toBeVisible();

    // Cancelling the chip returns the dock to the root target.
    await page.getByRole('button', { name: 'Cancel reply' }).click();
    await expect(page.locator('.os-write-dock-reply')).toHaveCount(0);
  });
});
