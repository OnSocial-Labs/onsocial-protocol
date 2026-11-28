import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * A feed article is a place screen. Back closes only that reader and
 * stays on /home. The feed column is covered while it is open.
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

async function openFeedRead(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubGraph(page);
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const globalTab = page.getByRole('tab', { name: 'Global' });
  if ((await globalTab.count()) > 0) await globalTab.click();
  const read = page
    .locator('.home-feed-list')
    .getByRole('button', { name: 'Read article' });
  await expect(read).toBeVisible({ timeout: 20_000 });
  await read.click();
  const reader = page.getByRole('dialog', { name: 'Night piece' });
  await expect(reader).toBeVisible();
  return reader;
}

test.describe('feed read on the place stack', () => {
  test('browser back closes the reader and stays on /home', async ({
    page,
  }) => {
    const reader = await openFeedRead(page);
    const column = page.locator('.home-feed');
    await expect(column).toHaveAttribute('data-feed-session', 'covered');
    await expect(page).toHaveURL(/\/home\/?$/);
    const parkedInColumn = await reader.evaluate((el) =>
      Boolean(el.closest('.home-feed'))
    );
    expect(parkedInColumn).toBe(false);

    await page.goBack();
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(column).not.toHaveAttribute('data-feed-session', 'covered');
    await expect(page.locator('.home-feed-list')).toBeVisible();
  });

  test('header back and escape close the reader', async ({ page }) => {
    const reader = await openFeedRead(page);
    await page.getByRole('button', { name: 'Back from article' }).click();
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);

    await page
      .locator('.home-feed-list')
      .getByRole('button', { name: 'Read article' })
      .click();
    await expect(reader).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.locator('.home-feed')).not.toHaveAttribute(
      'data-feed-session',
      'covered'
    );
  });
});
