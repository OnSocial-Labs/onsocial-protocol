import { expect, test, type Page } from '@playwright/test';
import { setE2eGraphWriting } from './helpers/e2e-graph';
import {
  dismissNextDevOverlay,
  e2ePortfolioAccountId,
  gotoApp,
} from './helpers';

/**
 * Feed Read is a place-stack screen. One history entry, URL stays /home.
 * Reload still has that entry. Esc and browser Back use the slide-over exit.
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
  const feed = page.locator('.home-feed-list');
  const read = feed.getByRole('button', { name: 'Read article' });
  await expect(read).toBeVisible({ timeout: 20_000 });
  await read.click();
  const reader = page.getByRole('dialog', { name: 'Night piece' });
  await expect(reader).toBeVisible();
  await expect(reader).toHaveCSS('opacity', '1');
  return { feed, reader };
}

test('browser back closes feed Read and stays on /home', async ({ page }) => {
  const { feed, reader } = await openFeedRead(page);
  await expect(page).toHaveURL(/\/home\/?$/);

  await page.goBack();

  await expect(reader).toHaveCount(0);
  await expect(page).toHaveURL(/\/home\/?$/);
  await expect(
    feed.getByRole('button', { name: 'Read article' })
  ).toBeVisible();
});

test('back leaves a Read screen that was reloaded', async ({ page }) => {
  const { reader } = await openFeedRead(page);
  await page.reload();
  await dismissNextDevOverlay(page);

  const reloaded = page.getByRole('dialog', { name: 'Night piece' });
  await expect(reloaded).toBeVisible({ timeout: 20_000 });
  await expect(reloaded).toContainText('A short piece from the feed.');
  await page.goBack();
  await expect(reloaded).toHaveCount(0);
  await expect(reader).toHaveCount(0);
  await expect(page).toHaveURL(/\/home\/?$/);
  await expect(
    page
      .locator('.home-feed-list')
      .getByRole('button', { name: 'Read article' })
  ).toBeVisible();
});

test('reload on a drop Read still shows the essay', async ({ page }) => {
  const account = e2ePortfolioAccountId();
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2eGraphWriting(page, 'reader');
  await gotoApp(page, `/@${account}/writing/night`);
  await dismissNextDevOverlay(page);

  await page.getByRole('link', { name: 'Drop', exact: true }).click();
  const drop = page.locator('[data-drop-layer-sheet]');
  await expect(drop).toBeVisible({ timeout: 15_000 });
  await drop.getByRole('button', { name: 'Read', exact: true }).click();
  const reader = page.locator(
    '[data-os-slide-over="true"].feed-article-slide'
  );
  await expect(reader).toBeVisible({ timeout: 15_000 });
  const body = reader.locator(
    '.collection-writing-body, .scarce-feed-medium-empty'
  );
  await expect(body).toBeVisible({ timeout: 15_000 });
  const essay = (await body.innerText()).replace(/\s+/g, ' ').trim();
  expect(essay.length).toBeGreaterThan(0);

  await page.reload();
  await dismissNextDevOverlay(page);
  const reloaded = page.locator(
    '[data-os-slide-over="true"].feed-article-slide'
  );
  await expect(reloaded).toBeVisible({ timeout: 20_000 });
  await expect(
    reloaded.locator('.collection-writing-body, .scarce-feed-medium-empty')
  ).toContainText(essay);
});

test('header back and escape close the read and leave the drop', async ({
  page,
}) => {
  const account = e2ePortfolioAccountId();
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2eGraphWriting(page, 'reader');
  await gotoApp(page, `/@${account}/writing/night`);
  await dismissNextDevOverlay(page);

  await page.getByRole('link', { name: 'Drop', exact: true }).click();
  const drop = page.locator('[data-drop-layer-sheet]');
  await expect(drop).toBeVisible({ timeout: 15_000 });

  const openRead = async () => {
    await drop.getByRole('button', { name: 'Read', exact: true }).click();
    const reader = page.locator(
      '[data-os-slide-over="true"].feed-article-slide'
    );
    await expect(reader).toBeVisible({ timeout: 15_000 });
    return reader;
  };

  const dropStays = async () => {
    await expect(drop).toBeVisible();
    await page.evaluate(
      () => new Promise((resolve) => window.setTimeout(resolve, 400))
    );
    await expect(drop).toBeVisible();
  };

  let reader = await openRead();
  await reader.getByRole('button', { name: 'Back from article' }).click();
  await expect(reader).toHaveCount(0);
  await dropStays();

  reader = await openRead();
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await dropStays();
});

test('in-app back works when a reloaded feed read has no card', async ({
  page,
}) => {
  let hideReadPost = false;
  const row = articleRow();
  const other = {
    ...articleRow(),
    postId: 'other-piece',
    value: JSON.stringify({
      v: 1,
      contentType: 'md',
      kind: 'longform',
      text: 'Another piece.',
      x: { onsocial: { article: { title: 'Other piece' } } },
    }),
  };
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      const pageRow = hideReadPost ? other : row;
      const rows = hideReadPost && query.includes('where:') ? [] : [pageRow];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { [field]: rows },
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
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const globalTab = page.getByRole('tab', { name: 'Global' });
  if ((await globalTab.count()) > 0) await globalTab.click();
  await page
    .locator('.home-feed-list')
    .getByRole('button', { name: 'Read article' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Night piece' })).toBeVisible();

  hideReadPost = true;
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (key.includes('home-feed')) sessionStorage.removeItem(key);
    }
  });
  await page.reload();
  await dismissNextDevOverlay(page);
  await expect(page.locator('.home-feed-list, .home-feed-state')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('dialog', { name: 'Night piece' })).toHaveCount(
    0
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const guard = (
          window as unknown as {
            __onsocialPostLayerPopGuard?: { depth: number };
          }
        ).__onsocialPostLayerPopGuard;
        const z = document.body.style.getPropertyValue('--os-thread-dock-z');
        return `${guard?.depth ?? 0}|${z}`;
      })
    )
    .toBe('0|');
  const trapped = await page.evaluate(() => {
    const guard = (
      window as unknown as {
        __onsocialPostLayerPopGuard?: { closeTop: () => boolean };
      }
    ).__onsocialPostLayerPopGuard;
    return guard ? guard.closeTop() : false;
  });
  expect(trapped).toBe(false);
});

test('a link hop does not leave a dead read entry', async ({ page }) => {
  const { reader } = await openFeedRead(page);
  const author = reader.getByRole('link', { name: /Alice/ }).first();
  await expect(author).toBeVisible();
  await author.click();
  await expect(page).not.toHaveURL(/\/home\/?$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/home\/?$/);
  await expect(page.getByRole('dialog', { name: 'Night piece' })).toHaveCount(
    0
  );
  await expect(page.locator('.home-feed-list')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (history.state as { onsocialReadLayer?: unknown } | null)
            ?.onsocialReadLayer ?? null
      )
    )
    .toBeNull();

  await page.reload();
  await dismissNextDevOverlay(page);
  await expect(page.locator('.home-feed-list')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('dialog', { name: 'Night piece' })).toHaveCount(
    0
  );
});

test('escape and browser back run the read exit slide', async ({ page }) => {
  const { reader } = await openFeedRead(page);

  await page.keyboard.press('Escape');
  await expect(reader).toHaveClass(/is-closing/);
  await expect
    .poll(() => reader.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(1);
  await expect(reader).toHaveCount(0);

  await page
    .locator('.home-feed-list')
    .getByRole('button', { name: 'Read article' })
    .click();
  await expect(reader).toBeVisible();
  await expect(reader).toHaveCSS('opacity', '1');

  const back = page.goBack();
  await expect(reader).toHaveClass(/is-closing/);
  await expect
    .poll(() => reader.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(1);
  await back;
  await expect(reader).toHaveCount(0);
  await expect(page).toHaveURL(/\/home\/?$/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .locator('.home-feed-list')
    .getByRole('button', { name: 'Read article' })
    .click();
  await expect(reader).toBeVisible();
  await expect(reader).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
});
