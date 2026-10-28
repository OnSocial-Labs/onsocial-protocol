import { expect, test, type Page } from '@playwright/test';
import {
  E2E_CHROME_TIMEOUT_MS,
  dismissNextDevOverlay,
  gotoApp,
} from './helpers';
import {
  expectCollectionPageSettled,
  stubCollectionPageGraph,
} from './helpers/collection-page';
import { setE2eGraphDrop } from './helpers/e2e-graph';

const CDN = 'https://cdn.testnet.onsocial.id';
const PHOTO_CID =
  'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const FACE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;

type GraphBody = { query?: string };

const PHOTO_POST = {
  accountId: 'alice.near',
  postId: 'photo-post',
  value: JSON.stringify({
    v: 1,
    text: 'Thread drawer photo post',
    media: [{ cid: PHOTO_CID, mime: 'image/jpeg', size: 200_000 }],
  }),
  blockHeight: 200,
  blockTimestamp: 1_700_000_000,
  receiptId: 'receipt-photo-post',
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

/** One photo post in the feed; empty thread; empty everything else. */
async function stubPhotoFeed(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [PHOTO_POST] } }),
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
  await page.route(`${CDN}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: FACE_SVG,
    });
  });
}

const quoteRow = (index: number) => ({
  quoteAuthor: `quoter-${String(index + 1).padStart(2, '0')}.testnet`,
  quoteId: `quote-${index + 1}`,
  value: JSON.stringify({ v: 1, text: `Quoted take ${index + 1}` }),
  blockHeight: 1_000_000 - index,
  blockTimestamp: 1_700_000_000_000 - index * 1_000,
  groupId: null,
  refAuthor: 'alice.testnet',
  refPath: 'alice.testnet/post/root-post',
  refType: 'Post',
});

/** Root post + one page of quotes + one reposter, mirroring the windowing stub. */
async function stubQuotesScreen(page: Page): Promise<void> {
  const quotes = Array.from({ length: 12 }, (_, index) => quoteRow(index));
  await page.route('**/api/onapi/graph/query', async (route) => {
    const payload = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = String(payload.query ?? '');
    const json = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data }),
      });
    if (query.includes('QuotesByPath')) {
      return json({ quotes });
    }
    if (query.includes('RepostersByPath')) {
      return json({
        reposts: [
          {
            repostAuthor: 'reposter-01.testnet',
            repostId: 'repost-1',
            groupId: null,
            blockTimestamp: 1_700_000_000_000,
          },
        ],
      });
    }
    if (query.includes('postsCurrent')) {
      return json({
        postsCurrent: [
          {
            accountId: 'alice.testnet',
            postId: 'root-post',
            value: JSON.stringify({
              v: 1,
              text: 'Root post for the quotes drawer.',
            }),
            blockHeight: 1_000_000,
            blockTimestamp: 1_700_000_000_000,
            parentPath: '',
            groupId: null,
          },
        ],
      });
    }
    return json({});
  });
}

/**
 * Drawer smooth-scroll invariant. One AppSmoothScrollProvider binds the
 * Lenis wheel coast to every shared overflow root (`.os-app-screen-body`,
 * `.glass-sheet-body`, …), so any drawer built on the shared primitives
 * picks the coast up automatically — no per-sheet wiring. These two tests
 * lock that contract: a freshly opened GlassSheet drawer (the scarce Mint
 * sheet, via OsGestureSheet → GlassSheet) gets bound on desktop
 * fine-pointer, and stays on native scroll under reduced motion. If a
 * drawer ever drifts off the shared primitives — or the provider gates
 * regress — these fail instead of users noticing one dead drawer.
 */

async function openMintSheet(page: Page) {
  await setE2eGraphDrop(page, 'default');
  await stubCollectionPageGraph(page);
  await gotoApp(page, '/collection/night-drive');
  await dismissNextDevOverlay(page);
  await expectCollectionPageSettled(page);

  await page.getByRole('button', { name: 'Mint', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Mint' });
  await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
  return sheet;
}

test.describe('drawer smooth scroll (Lenis)', () => {
  test('desktop fine-pointer: a freshly opened drawer body picks up the coast', async ({
    page,
  }) => {
    // The page screen body binds first — proof the provider is live.
    await setE2eGraphDrop(page, 'default');
    await stubCollectionPageGraph(page);
    await gotoApp(page, '/collection/night-drive');
    await dismissNextDevOverlay(page);
    await expectCollectionPageSettled(page);
    await expect(page.locator('.os-app-screen-body').first()).toHaveClass(
      /\blenis\b/,
      { timeout: E2E_CHROME_TIMEOUT_MS }
    );

    await page.getByRole('button', { name: 'Mint', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Mint' });
    await expect(sheet).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });

    // Mounted after the provider started — the DOM observer must find it.
    // `lenis-smooth` is a transient class Lenis only carries while an
    // animated scroll is in flight, so the contract is: bound (`lenis`)
    // and running (not `lenis-stopped`).
    const body = sheet.locator('.glass-sheet-body');
    await expect(body).toHaveClass(/\blenis\b/);
    await expect(body).not.toHaveClass(/\blenis-stopped\b/);
  });

  test('reduced motion: the same drawer stays on native scroll', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sheet = await openMintSheet(page);

    const body = sheet.locator('.glass-sheet-body');
    await expect(body).toBeVisible();
    // Give a broken provider every chance to bind before asserting absence.
    await page.waitForTimeout(600);
    await expect(body).not.toHaveClass(/\blenis\b/);
    await expect(page.locator('.os-app-screen-body').first()).not.toHaveClass(
      /\blenis\b/
    );
  });

  test('media-face thread drawer picks up the coast', async ({ page }) => {
    await stubPhotoFeed(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) {
      await globalTab.click();
    }
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Thread drawer photo post');

    // Open the photo enlarge face, then Reply — the in-face thread drawer.
    await feed.locator('.post-media-tile').first().click();
    const face = page.locator('[data-os-slide-over="true"]').first();
    await expect(face).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await face
      .getByRole('button', { name: 'Reply to this post' })
      .first()
      .click();

    // Same conversation as the thread layer — must coast the same.
    const body = page.locator('.feed-photo-thread-body');
    await expect(body).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(body).toHaveClass(/\blenis\b/);
    await expect(body).not.toHaveClass(/\blenis-stopped\b/);
  });

  test('quotes and reposters lists pick up the coast', async ({ page }) => {
    await stubQuotesScreen(page);
    await gotoApp(page, '/@alice.testnet/posts/root-post/quotes');
    await dismissNextDevOverlay(page);

    const quotesScroll = page.locator(
      '#post-quotes-page-quotes .post-quotes-page-scroll'
    );
    await expect(
      quotesScroll.getByText('Quoted take 1', { exact: true })
    ).toBeVisible({ timeout: E2E_CHROME_TIMEOUT_MS });
    await expect(quotesScroll).toHaveClass(/\blenis\b/);
    await expect(quotesScroll).not.toHaveClass(/\blenis-stopped\b/);

    const repostsScroll = page.locator(
      '#post-quotes-page-reposts .post-quotes-page-scroll'
    );
    await expect(repostsScroll).toHaveClass(/\blenis\b/);

    // Both lists sit in a sideways snap pager — the horizontal guard must
    // ride the list so diagonal trackpad swipes stay native.
    await expect(
      quotesScroll.locator('[data-lenis-prevent-horizontal]')
    ).toHaveCount(1);
    await expect(
      repostsScroll.locator('[data-lenis-prevent-horizontal]')
    ).toHaveCount(1);
  });
});
