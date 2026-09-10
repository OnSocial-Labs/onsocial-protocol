import { expect, test, type Page, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

type HomeFixture = {
  label: string;
  postId: string;
};

function homeRows(fixture: HomeFixture) {
  return [
    {
      accountId: 'alice.near',
      postId: fixture.postId,
      value: JSON.stringify({ v: 1, text: fixture.label }),
      blockHeight: 200,
      blockTimestamp: 1_700_000_000,
      receiptId: `receipt-${fixture.postId}`,
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
    },
  ];
}

function graphFeedField(query: string): 'postsFeed' | 'postsCurrent' | null {
  if (query.includes('postsFeed')) return 'postsFeed';
  if (query.includes('postsCurrent')) return 'postsCurrent';
  return null;
}

async function fulfillHomeFeed(route: Route, fixture: HomeFixture) {
  const body = JSON.parse(route.request().postData() ?? '{}') as {
    query?: string;
  };
  const field = graphFeedField(body.query ?? '');
  if (!field) {
    await route.continue();
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { [field]: homeRows(fixture) } }),
  });
}

test.describe('Home loading contract', () => {
  test.describe.configure({ mode: 'serial' });

  test('shows cold skeleton, then ignores an older response after sort changes', async ({
    page,
  }) => {
    let releaseHot!: () => void;
    const hotBlocked = new Promise<void>((resolve) => {
      releaseHot = resolve;
    });

    await page.route('**/api/onapi/graph/query', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        query?: string;
      };
      const query = body.query ?? '';
      if (!graphFeedField(query)) {
        await route.continue();
        return;
      }

      const isRecent = query.includes('orderBy: [{blockHeight: DESC}]');
      if (!isRecent) {
        await hotBlocked;
      }
      await fulfillHomeFeed(route, {
        label: isRecent ? 'Recent response' : 'Hot response',
        postId: isRecent ? 'recent-1' : 'hot-1',
      });
    });

    await gotoApp(page, '/home');
    await expect(page.locator('.post-row-skeleton-list')).toBeVisible();

    await dismissNextDevOverlay(page);
    const recent = page.getByRole('button', { name: 'Recent' });
    await expect(recent).toBeVisible();
    await expect(recent).toHaveAttribute('aria-pressed', 'false');
    await recent.click();
    await expect(recent).toHaveAttribute('aria-pressed', 'true');

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Recent response');
    await expect(feed).not.toContainText('Hot response');

    releaseHot();
    await expect(feed).toContainText('Recent response');
    await expect(page.locator('.post-row-skeleton-list')).toHaveCount(0);
  });

  test('keeps painted posts visible during a slow refresh', async ({
    page,
  }) => {
    let feedRequestCount = 0;
    let releaseRefresh!: () => void;
    const refreshBlocked = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    await page.route('**/api/onapi/graph/query', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        query?: string;
      };
      if (!graphFeedField(body.query ?? '')) {
        await route.continue();
        return;
      }

      feedRequestCount += 1;
      if (feedRequestCount === 1) {
        await fulfillHomeFeed(route, {
          label: 'Initial response',
          postId: 'initial-1',
        });
        return;
      }

      await refreshBlocked;
      await fulfillHomeFeed(route, {
        label: 'Refreshed response',
        postId: 'refreshed-1',
      });
    });

    await gotoApp(page, '/home');
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Initial response');

    await page.getByRole('button', { name: 'Recent' }).click();
    await expect(feed).toContainText('Initial response');
    await expect(page.locator('.post-row-skeleton-list')).toHaveCount(0);
    await expect(feed).toHaveClass(/is-refreshing/);

    releaseRefresh();
    await expect(feed).toContainText('Refreshed response');
  });
});
