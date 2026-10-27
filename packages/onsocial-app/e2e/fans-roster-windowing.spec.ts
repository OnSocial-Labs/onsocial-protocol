import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Fans roster windowing — the gesture roster (post likes, album fans, event
 * guests) shares the feed-window core with the social lists and the DM
 * inbox: past the row threshold (30), far rows collapse into spacer divs
 * and rematerialize on scroll back. One stubbed post with 44 likers crosses
 * it inside the hug sheet's own scroll body.
 */

const FAN_COUNT = 44;
const fanId = (index: number) =>
  `fan${String(index).padStart(2, '0')}.testnet`;
const fanName = (index: number) => `Fan ${String(index).padStart(2, '0')}`;

const fanIds = Array.from({ length: FAN_COUNT }, (_, index) => fanId(index));

const likedPost = {
  accountId: 'alice.near',
  postId: 'fan-root',
  value: JSON.stringify({ v: 1, text: 'A post with fans' }),
  blockHeight: 200,
  blockTimestamp: 1_700_000_000,
  receiptId: 'receipt-fan-root',
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

async function stubFansGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      query?: string;
    };
    const query = body.query ?? '';

    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [likedPost] } }),
      });
      return;
    }
    if (query.includes('PostReactionCounts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            reactionCounts: [
              {
                postOwner: 'alice.near',
                postPath: 'post/fan-root',
                reactionKind: 'like',
                reactionCount: FAN_COUNT,
              },
            ],
          },
        }),
      });
      return;
    }
    if (query.includes('ThreadCountsByPaths')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { threadReplyCounts: [], quoteCounts: [], repostCounts: [] },
        }),
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
    if (query.includes('SocialSpendEvents')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { socialSpendEvents: [] } }),
      });
      return;
    }
    if (query.includes('PostLikeAccounts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            reactionsCurrent: fanIds.map((accountId) => ({ accountId })),
          },
        }),
      });
      return;
    }
    if (query.includes('ProfileStatsBatch')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            profileSearch: fanIds.map((accountId, index) => ({
              accountId,
              name: fanName(index),
              bio: null,
              standingCount: 0,
              standingWithCount: 0,
              mutualStandingCount: 0,
              endorsementsReceivedCount: 0,
              endorsementsGivenCount: 0,
            })),
            profileKinds: [],
          },
        }),
      });
      return;
    }
    if (query.includes('FansRosterViewerContext')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            viewerOutgoing: [],
            viewerIncoming: [],
            viewerEndorsements: [],
            viewerOutgoingEndorsements: [],
          },
        }),
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

test.describe('fans roster windowing', () => {
  test('far roster rows collapse to spacers and rematerialize on scroll back', async ({
    page,
  }) => {
    await stubFansGraph(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);

    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('A post with fans');
    await feed
      .getByRole('button', { name: `View who liked — ${FAN_COUNT} likes` })
      .click();

    const sheet = page.getByRole('dialog', { name: 'Likes' });
    await expect(sheet).toBeVisible();
    const list = sheet.locator('.scarce-fans-standing');
    const row = (index: number) =>
      list.locator(`[data-standing-key="${fanId(index)}"]`);
    const renderedRowCount = () =>
      list.locator('[data-standing-key]').count();

    await expect(row(0)).toBeVisible({ timeout: 30_000 });

    // 44 fans cross the threshold — once the window engages, rows away from
    // the sheet body's viewport collapse into a bottom spacer.
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(FAN_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      0
    );

    // Deep scroll — the tail fan materializes, head rows collapse. The first
    // pass can land mid-list as spacers settle, so scroll twice.
    const scroller = sheet.locator('.glass-sheet-body');
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(row(FAN_COUNT - 1)).toBeVisible({ timeout: 15_000 });
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(list.locator('[data-feed-window-spacer="top"]')).toHaveCount(
      1
    );
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(FAN_COUNT);
    await expect(row(0)).toHaveCount(0);

    // Scroll back — the head fan rematerializes.
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(row(0)).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(renderedRowCount, { timeout: 15_000 })
      .toBeLessThan(FAN_COUNT);
    await expect(
      list.locator('[data-feed-window-spacer="bottom"]')
    ).toHaveCount(1);
  });
});
