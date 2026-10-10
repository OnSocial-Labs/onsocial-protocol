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
    authorName: 'Alice',
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

test.describe('Home feed visible cards', () => {
  test('shows the empty line when the only rows are replies', async ({
    page,
  }) => {
    await page.route('**/api/onapi/graph/query', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const field = graphField(body.query ?? '');
      if (!field) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            [field]: [
              feedRow({
                accountId: 'alice.near',
                postId: 'reply-only',
                text: 'Hidden reply',
                parentAuthor: 'bob.near',
                parentPath: 'bob.near/post/root',
              }),
            ],
          },
        }),
      });
    });

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    await expect(page.locator('.home-feed-state')).toContainText(
      'No posts yet. Be the first to share something.'
    );
    await expect(page.locator('.home-feed-list')).toHaveCount(0);
  });

  test('walks a full page of replies and paints the next root', async ({
    page,
  }) => {
    await page.route('**/api/onapi/graph/query', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const field = graphField(body.query ?? '');
      if (!field) {
        await route.continue();
        return;
      }
      const offset = body.variables?.offset ?? 0;
      const rows =
        offset === 0
          ? Array.from({ length: 24 }, (_, index) =>
              feedRow({
                accountId: 'alice.near',
                postId: `reply-${index}`,
                text: `Hidden reply ${index}`,
                parentAuthor: 'bob.near',
                parentPath: 'bob.near/post/root',
              })
            )
          : [
              feedRow({
                accountId: 'cara.near',
                postId: 'visible-root',
                text: 'Visible root',
              }),
            ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: rows } }),
      });
    });

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Visible root');
    await expect(feed).not.toContainText('Hidden reply 0');
    await expect(page.locator('.home-feed-state')).toHaveCount(0);
  });

  test('keeps Recent on a topic opened from Saved', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('onsocial.e2e.accountId', 'alice.near');
      window.sessionStorage.setItem('onsocial.home.feed-lens', 'saved');
    });
    await page.route('**/api/onapi/graph/query', async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const field = graphField(body.query ?? '');
      if (!field) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [] } }),
      });
    });

    await gotoApp(page, '/home?tag=near');
    await dismissNextDevOverlay(page);
    await expect(page.getByRole('tab', { name: 'Saved' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    await expect(page.getByRole('tab', { name: '#near' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.getByRole('button', { name: 'Recent' })).toBeVisible();
  });

  test('paints a bookmarked reply on Saved', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('onsocial.e2e.accountId', 'alice.near');
      window.sessionStorage.setItem('onsocial.home.feed-lens', 'saved');
    });
    await page.route('**/api/onapi/graph/query', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const query = body.query ?? '';
      if (query.includes('savesCurrent')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              savesCurrent: [
                {
                  accountId: 'alice.near',
                  contentPath: 'bob.near/post/saved-reply',
                  value: '{}',
                  blockHeight: 10,
                  blockTimestamp: 1_700_000_000,
                  operation: 'set',
                },
              ],
            },
          }),
        });
        return;
      }
      const field = graphField(query);
      if (!field) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            [field]: [
              feedRow({
                accountId: 'bob.near',
                postId: 'saved-reply',
                text: 'Bookmarked reply',
                parentAuthor: 'cara.near',
                parentPath: 'cara.near/post/root',
              }),
            ],
          },
        }),
      });
    });

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Bookmarked reply');
    await expect(feed).toContainText('Replying to');
    await expect(page.getByRole('button', { name: 'Recent' })).toHaveCount(0);
  });
});
