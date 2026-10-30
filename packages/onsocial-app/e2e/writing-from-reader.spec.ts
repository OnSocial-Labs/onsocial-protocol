import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Feed reader → Writing. The sheet covers the open article on the tap.
 * The feed list does not get a turn in between, and the article stays
 * mounted underneath so back can return to it.
 */

type GraphBody = { query?: string };

function articleRow() {
  return {
    accountId: 'alice.near',
    postId: 'night-piece',
    value: JSON.stringify({
      v: 1,
      contentType: 'md',
      kind: 'longform',
      text: 'A short piece from the feed.',
      x: { onsocial: { article: { title: 'Night piece' } } },
    }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: 'receipt-night-piece',
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: 'longform',
    audiences: '',
    groupId: '',
    isGroupContent: false,
    authorName: 'Alice',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

async function stubGraph(page: Page) {
  const row = articleRow();
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [row] } }),
      });
      return;
    }
    if (
      query.includes('threadReplies') ||
      query.includes('threadVisibleReplies')
    ) {
      const field = query.includes('threadVisibleReplies')
        ? 'threadVisibleReplies'
        : 'threadReplies';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [] } }),
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

test('writing covers the open article instead of the feed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubGraph(page);
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const globalTab = page.getByRole('tab', { name: 'Global' });
  if ((await globalTab.count()) > 0) await globalTab.click();

  const feed = page.locator('.home-feed-list');
  const read = feed.getByRole('button', { name: 'Read article' });
  await expect(read).toBeVisible({ timeout: 20_000 });
  await read.click();

  const reader = page.getByRole('dialog', { name: 'Night piece' });
  await expect(reader).toBeVisible();
  await reader.getByRole('link', { name: 'Writing' }).click();

  const shelf = page.getByRole('dialog', { name: 'Writing' });
  await expect(shelf).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('[data-feed-session="live"]')).toHaveCount(1);
  await expect(reader).toBeAttached();
  await expect(
    shelf.locator('.portfolio-writing-pending, .portfolio-writing-list')
  ).toBeVisible();
});
