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

function homeColumn(page: Page) {
  return page.locator('main.os-app-screen-body').filter({
    has: page.locator('.home-feed'),
  });
}

async function openFeedRead(page: Page, fromDiscover = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubGraph(page);
  if (fromDiscover) await gotoApp(page, '/discover');
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
    const column = homeColumn(page);
    await expect(column).toHaveAttribute('data-feed-session', 'covered');
    await expect(page.locator('.home-feed')).not.toHaveAttribute(
      'data-feed-session',
      'covered'
    );
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

  // Regression: header Back must stay on /home (not about:blank) after the
  // exit slide's history.back. Fail-before: 237483a6e CI; pass-after: 83306aa62.
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
    await expect(homeColumn(page)).not.toHaveAttribute(
      'data-feed-session',
      'covered'
    );
  });

  test('a second back leaves /home', async ({ page }) => {
    const reader = await openFeedRead(page, true);
    await page.goBack();
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.locator('.home-feed-list')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/discover\/?$/);
  });

  test('reload with a read open steps over the extra /home entry', async ({
    page,
  }) => {
    await openFeedRead(page, true);
    await page.reload();
    await dismissNextDevOverlay(page);
    await expect(page.getByRole('dialog', { name: 'Night piece' })).toHaveCount(
      0
    );
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.history.state != null &&
            typeof window.history.state === 'object' &&
            (window.history.state as { onsocialPostLayer?: boolean })
              .onsocialPostLayer === true
        )
      )
      .toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/discover\/?$/);
  });

  test('profile hop parks the reader and browser back closes it', async ({
    page,
  }) => {
    const reader = await openFeedRead(page, true);
    await reader.getByRole('link', { name: "View Alice's profile" }).click();
    await expect(page).toHaveURL(/\/@alice\.near/);
    await expect(reader).toBeHidden();
    await page.goBack();
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(reader).toBeVisible();
    await expect.poll(() => placeLayerFlag(page)).toBe(true);
    await page.goBack();
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.locator('.home-feed-list')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/discover\/?$/);
  });

  test('writing loads the shelf and one back returns to the feed', async ({
    page,
  }) => {
    const reader = await openFeedRead(page, true);
    await reader.getByRole('link', { name: 'Writing' }).click();
    await expect(page).toHaveURL(/\/writing/);
    await expect(reader).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.locator('.home-feed-list')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/discover\/?$/);
  });

  test('open post parks the reader and browser back closes it', async ({
    page,
  }) => {
    const reader = await openFeedRead(page, true);
    await reader.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Open post' }).click();
    await expect(page).toHaveURL(/\/posts\/night-piece/);
    await expect(reader).toBeHidden();
    await page.goBack();
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(reader).toBeVisible();
    await expect.poll(() => placeLayerFlag(page)).toBe(true);
    await page.goBack();
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);
    await expect(page.locator('.home-feed-list')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/discover\/?$/);
  });

  test('a read over a post steps off every screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubGraph(page);
    await gotoApp(page, '/discover');
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) await globalTab.click();
    const postLink = page
      .locator('.home-feed-list .post-identity-time')
      .first();
    await expect(postLink).toBeVisible({ timeout: 20_000 });
    await postLink.click();
    const thread = page.locator('.post-thread-sheet-panel');
    await expect(thread).toBeVisible();
    await expect(page).toHaveURL(/\/posts\/night-piece/);
    await thread.getByRole('button', { name: 'Read article' }).click();
    const reader = page.getByRole('dialog', { name: 'Night piece' });
    await expect(reader).toBeVisible();
    await reader.getByRole('link', { name: "View Alice's profile" }).click();
    await expect(page).toHaveURL(/\/@alice\.near/);
    await expect(reader).toBeHidden();
    await page.goBack();
    await expect(reader).toBeVisible();
    await expect.poll(() => placeLayerFlag(page)).toBe(true);
    await expect(page).toHaveURL(/\/posts\/night-piece/);
    await page.goBack();
    await expect(reader).toHaveCount(0);
    await expect(thread).toBeVisible();
    await expect(page).toHaveURL(/\/posts\/night-piece/);
    await page.goBack();
    await expect(thread).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/discover\/?$/);
  });
});

async function placeLayerFlag(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      window.history.state != null &&
      typeof window.history.state === 'object' &&
      (window.history.state as { onsocialPostLayer?: boolean })
        .onsocialPostLayer === true
  );
}

function dropAnnounceRow() {
  return {
    accountId: 'alice.near',
    postId: 'held-drop',
    value: JSON.stringify({
      v: 1,
      text: 'A drop announce.',
      embeds: [
        {
          kind: 'collection',
          chain: 'near',
          contract: 'scarces.near',
          collectionId: 'held-essay',
        },
      ],
      x: {
        onsocial: {
          drop: {
            collectionId: 'held-essay',
            title: 'Held essay',
            mediumKind: 'writing',
            priceNear: '1',
          },
        },
      },
    }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: 'receipt-held-drop',
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    refPath: '',
    refAuthor: '',
    refType: '',
    channel: '',
    kind: '',
    audiences: '',
    groupId: '',
    isGroupContent: false,
    authorName: 'Alice',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

function sourceEssayRow() {
  return {
    ...dropAnnounceRow(),
    postId: 'source-essay',
    value: JSON.stringify({
      v: 1,
      contentType: 'md',
      kind: 'longform',
      text: 'The late paragraph.',
      x: { onsocial: { article: { title: 'Late light' } } },
    }),
  };
}

function heldCollectionRow() {
  const extra = JSON.stringify({
    kind: 'writing',
    writingFormat: 'essay',
    sourcePost: { path: 'alice.near/post/source-essay' },
  });
  return {
    collectionId: 'held-essay',
    creatorId: 'alice.near',
    appId: null,
    price: '1000000000000000000000000',
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: 8,
    startTime: null,
    endTime: null,
    createdAt: 1_700_000_000_000_000_000,
    mintMode: null,
    maxPerWallet: null,
    paused: false,
    cancelled: false,
    banned: false,
    transferable: true,
    renewable: false,
    maxRedeems: null,
    randomAssignment: false,
    appCommissionBps: null,
    title: 'Held essay',
    media: null,
    description: null,
    kind: 'writing',
    mediumKind: 'writing',
    sourcePostPath: 'alice.near/post/source-essay',
    metadataTemplate: JSON.stringify({ title: 'Held essay', extra }),
    metadata: null,
    extraJson: extra,
    royaltyJson: null,
  };
}

async function stubHeldDrop(page: Page) {
  let releaseCatalog = () => {};
  let releaseEssay = () => {};
  const catalogGate = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  const essayGate = new Promise<void>((resolve) => {
    releaseEssay = resolve;
  });
  const drop = dropAnnounceRow();
  await page.route('**/api/onapi/data/get-one**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requested_key: url.searchParams.get('key') ?? '',
        full_key: '',
        value: null,
        deleted: false,
        corrupted: false,
      }),
    });
  });
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody & {
      variables?: { postId?: string };
    };
    const query = body.query ?? '';
    if (query.includes('ScarcesCollectionsCurrentByIds')) {
      await catalogGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: [heldCollectionRow()] },
        }),
      });
      return;
    }
    if (
      query.includes('PersonalPost') ||
      body.variables?.postId === 'source-essay'
    ) {
      await essayGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { postsCurrent: [sourceEssayRow()] },
        }),
      });
      return;
    }
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [drop] } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
  return {
    releaseCatalog,
    releaseEssay,
  };
}

async function openHeldDropRead(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  const gates = await stubHeldDrop(page);
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const globalTab = page.getByRole('tab', { name: 'Global' });
  if ((await globalTab.count()) > 0) await globalTab.click();
  const read = page.locator('.post-card-scarce-read');
  await expect(read).toBeVisible({ timeout: 20_000 });
  await read.click();
  const reader = page.getByRole('dialog', { name: 'Held essay' });
  await expect(reader).toBeVisible();
  await expect(page.getByText('The late paragraph.')).toHaveCount(0);
  return { reader, ...gates };
}

test.describe('drop-backed feed read', () => {
  test('a held catalog still fills the open reader', async ({ page }) => {
    const { releaseCatalog, releaseEssay } = await openHeldDropRead(page);
    releaseCatalog();
    releaseEssay();
    await expect(page.getByText('The late paragraph.')).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Late light' })
    ).toBeVisible();
  });

  test('a late essay does not reopen a closed reader', async ({ page }) => {
    const { reader, releaseCatalog, releaseEssay } =
      await openHeldDropRead(page);
    const essayRequested = page.waitForRequest((request) =>
      (request.postData() ?? '').includes('PersonalPost')
    );
    releaseCatalog();
    await essayRequested;
    await page.getByRole('button', { name: 'Back from article' }).click();
    await expect(reader).toHaveCount(0);
    await expect(page).toHaveURL(/\/home\/?$/);
    const essayResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/onapi/graph/query') &&
        (response.request().postData() ?? '').includes('PersonalPost')
    );
    releaseEssay();
    await essayResponse;
    // Sample closed across ~700ms — each tick must stay closed (poll would
    // pass on the first match and miss a late reopen).
    for (let i = 0; i < 4; i += 1) {
      await expect(page).toHaveURL(/\/home\/?$/);
      await expect(page.getByText('The late paragraph.')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (i < 3) await page.waitForTimeout(175);
    }
  });
});
