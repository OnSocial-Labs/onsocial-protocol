import { expect, test, type Route } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

type GraphBody = {
  query?: string;
};

function feedRow(opts: { accountId: string; postId: string; text: string }) {
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

const ROOT = { accountId: 'alice.near', postId: 'root-post', text: 'Root post' };
const FRESH = {
  accountId: 'bob.near',
  postId: 'fresh-post',
  text: 'Fresh post',
};

const TOUCH = {
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
  clientX: 195,
  bubbles: true,
  cancelable: true,
};

/**
 * A touch drag at the top of Home walks the pill (Pull to check → Release to
 * check → Checking…) and reloads the head through the soft refresh — painted
 * rows stay on screen while the new head merges in.
 */
test.describe('home pull to check', () => {
  test('a touch drag past the trigger checks for new posts', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    let feedRequests = 0;
    let pullReleased = false;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    await page.route('**/api/onapi/graph/query', async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const field = graphField(body.query ?? '');
      if (!field) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: {} }),
        });
        return;
      }
      feedRequests += 1;
      // Only the reload the pull fired waits — initial-load queries answer.
      if (pullReleased) await refreshGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            [field]: pullReleased
              ? [feedRow(FRESH), feedRow(ROOT)]
              : [feedRow(ROOT)],
          },
        }),
      });
    });

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Root post');
    await expect(feed).not.toContainText('Fresh post');
    const requestsBeforePull = feedRequests;

    // Touch drag from the top: 40px travel arms the pill, 160px passes the
    // trigger (travel is resisted at half finger distance).
    const body = page.locator('.os-app-screen-body').first();
    await body.dispatchEvent('pointerdown', {
      ...TOUCH,
      pointerId: 7,
      clientY: 300,
    });
    await body.dispatchEvent('pointermove', {
      ...TOUCH,
      pointerId: 7,
      clientY: 340,
    });

    const indicator = page.locator('.home-feed-pull');
    await expect(indicator).toContainText('Pull to check');

    await body.dispatchEvent('pointermove', {
      ...TOUCH,
      pointerId: 7,
      clientY: 460,
    });
    await expect(indicator).toContainText('Release to check');

    // React flushes the refresh inside the pointerup dispatch — arm the gate
    // first so the reload request is the one that waits.
    pullReleased = true;
    await body.dispatchEvent('pointerup', {
      ...TOUCH,
      pointerId: 7,
      clientY: 460,
    });

    // The head reload starts; the pill confirms while painted rows stay.
    await expect(indicator).toContainText('Checking…');
    await expect
      .poll(() => feedRequests)
      .toBeGreaterThan(requestsBeforePull);
    await expect(feed).toContainText('Root post');

    releaseRefresh();
    await expect(feed).toContainText('Fresh post');
    await expect(feed).toContainText('Root post');
    await expect(indicator).toHaveCount(0);
  });

  test('a drag that starts below the top does not arm', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const tallFeed = [
      feedRow(ROOT),
      ...Array.from({ length: 12 }, (_, index) =>
        feedRow({
          accountId: 'cara.near',
          postId: `filler-${index}`,
          text: `Filler post ${index}`,
        })
      ),
    ];

    let watchForRefresh = false;
    await page.route('**/api/onapi/graph/query', async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
      const field = graphField(body.query ?? '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: field
            ? {
                [field]: watchForRefresh
                  ? [feedRow(FRESH), ...tallFeed]
                  : tallFeed,
              }
            : {},
        }),
      });
    });

    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Root post');
    // Let initial-load stragglers settle so only a stray refresh would fetch.
    await page.waitForTimeout(1_000);
    await expect(feed).not.toContainText('Fresh post');

    const body = page.locator('.os-app-screen-body').first();
    await body.evaluate((el) => {
      el.scrollTop = 400;
    });
    // The list is tall enough to hold the scroll — the pull must not arm here.
    await expect
      .poll(() => body.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(100);
    watchForRefresh = true;

    await body.dispatchEvent('pointerdown', {
      ...TOUCH,
      pointerId: 8,
      clientY: 300,
    });
    await body.dispatchEvent('pointermove', {
      ...TOUCH,
      pointerId: 8,
      clientY: 460,
    });
    await body.dispatchEvent('pointerup', {
      ...TOUCH,
      pointerId: 8,
      clientY: 460,
    });

    // No pill, and no reload — any request now would paint the fresh post.
    await expect(page.locator('.home-feed-pull')).toHaveCount(0);
    await page.waitForTimeout(750);
    await expect(feed).not.toContainText('Fresh post');
  });
});
