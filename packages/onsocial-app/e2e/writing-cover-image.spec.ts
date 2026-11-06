import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import {
  clearComposerThreadDrafts,
  openHomePostComposer,
} from './helpers/compose-thread';
import { seedE2eMockSigner } from './helpers/e2e-mock-signer';

/**
 * Writing and article covers use the same picture as a feed photo:
 * avif, then webp, then the original format, one retry, then the
 * byte-original file. A blurred 128px preview sits underneath.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_JPEG = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';

const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;
const GIF_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
const COVER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

type GraphBody = { query?: string };

function articleRow() {
  return {
    accountId: 'carol.near',
    postId: 'article-post',
    value: JSON.stringify({
      v: 1,
      contentType: 'md',
      kind: 'longform',
      text: 'A long-form story whose photo cover must stay sharp in the feed.',
      media: [{ cid: CID_JPEG, mime: 'image/jpeg', size: 200_000 }],
      x: {
        onsocial: { article: { title: 'Tale of the Blurred Cover' } },
      },
    }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000,
    receiptId: 'receipt-article-post',
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
    authorName: 'Carol',
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

async function stubFeedGraph(page: Page): Promise<void> {
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}

async function openGlobalFeed(page: Page) {
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const globalTab = page.getByRole('tab', { name: 'Global' });
  if ((await globalTab.count()) > 0) await globalTab.click();
  const feed = page.locator('.home-feed-list');
  await expect(feed).toContainText('Tale of the Blurred Cover');
  return feed;
}

test.describe('writing cover image path', () => {
  test('composer preview uses the shared picture for a cover photo', async ({
    page,
  }) => {
    await clearComposerThreadDrafts(page);
    await seedE2eMockSigner(page);
    await openHomePostComposer(page);
    await dismissNextDevOverlay(page);

    const postDialog = page.getByRole('dialog', { name: 'New post' });
    await postDialog.getByRole('option', { name: 'Article' }).click();
    const articleDialog = page.getByRole('dialog', { name: 'New article' });
    await articleDialog
      .getByRole('textbox', { name: 'Article title' })
      .fill('Night cover');

    const fileInput = articleDialog.locator(
      'input[type="file"][accept="image/jpeg,image/png,image/webp"]'
    );
    await fileInput.setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: COVER_PNG,
    });

    const thumb = articleDialog.locator('.guild-composer-cover-thumb');
    await expect(thumb).toHaveAttribute('aria-hidden', 'true');
    const thumbImg = thumb.locator('img');
    await expect(thumbImg).toBeVisible();
    await expect(thumbImg).toHaveAttribute('alt', '');
    await expect(thumbImg).toHaveAttribute('src', /^blob:/);

    await articleDialog
      .getByRole('button', { name: 'Article cover: Photo. Change cover' })
      .click();
    const preview = page.locator('.guild-composer-cover-preview');
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    const previewImg = preview.locator('img');
    await expect(previewImg).toBeVisible();
    await expect(previewImg).toHaveAttribute('alt', '');
    await expect(preview.locator('.ipfs-blur-preview')).toHaveCount(0);
  });

  test('feed card and article header request the wide cover, with a blurred preview', async ({
    page,
  }) => {
    await stubFeedGraph(page);
    await page.route(`${CDN}/img/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: VARIANT_SVG,
      });
    });
    await page.route(`${CDN}/ipfs/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: VARIANT_SVG,
      });
    });

    const feed = await openGlobalFeed(page);
    const cover = feed.locator(
      '.post-card-article-cover .portfolio-writing-cover-photo'
    );
    await expect(cover).toBeVisible();
    await expect(cover).toHaveAttribute('alt', '');
    const preview = feed.locator(
      '.post-card-article-cover .ipfs-blur-preview'
    );
    await expect(preview).toHaveAttribute('alt', '');
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(preview).toHaveAttribute(
      'src',
      `${CDN}/img/128/ipfs/${CID_JPEG}`
    );
    const previewPicture = feed.locator(
      '.post-card-article-cover picture.ipfs-img',
      { has: page.locator('.ipfs-blur-preview') }
    );
    await expect(previewPicture.locator('source').first()).toHaveAttribute(
      'type',
      'image/avif'
    );
    await expect
      .poll(() => cover.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15_000,
      })
      .toContain(`/img/1080/avif/ipfs/${CID_JPEG}`);

    await feed.getByRole('button', { name: 'Read article' }).click();
    const article = page.getByRole('dialog', {
      name: 'Tale of the Blurred Cover',
    });
    await expect(article).toBeVisible({ timeout: 15_000 });
    const header = article.locator(
      '.portfolio-writing-article-cover .portfolio-writing-cover-photo'
    );
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute('alt', '');
    await expect(
      article.locator('.portfolio-writing-article-cover .ipfs-blur-preview')
    ).toHaveAttribute('aria-hidden', 'true');
    await expect
      .poll(() => header.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15_000,
      })
      .toContain(`/img/1080/avif/ipfs/${CID_JPEG}`);
    const box = await article
      .locator('.portfolio-writing-article-cover')
      .boundingBox();
    expect(box && box.width > 0 && Math.abs(box.width - box.height) < 2).toBe(
      true
    );
  });

  test('a failed cover variant retries once, then uses the original file', async ({
    page,
  }) => {
    let variantHits = 0;
    await stubFeedGraph(page);
    await page.route(`${CDN}/img/**`, async (route) => {
      variantHits += 1;
      await route.fulfill({
        status: 502,
        contentType: 'text/plain',
        body: 'no',
      });
    });
    await page.route(`${CDN}/ipfs/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: GIF_BYTES,
      });
    });
    const feed = await openGlobalFeed(page);
    const cover = feed.locator(
      '.post-card-article-cover .portfolio-writing-cover-photo'
    );
    await expect
      .poll(() => cover.getAttribute('src'), { timeout: 15_000 })
      .toBe(`${CDN}/ipfs/${CID_JPEG}`);
    await expect
      .poll(() => cover.evaluate((el) => el.parentElement?.tagName))
      .not.toBe('PICTURE');
    expect(variantHits).toBeGreaterThanOrEqual(2);
  });

  test('reduced motion skips the cover fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stubFeedGraph(page);
    await page.route(`${CDN}/img/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: VARIANT_SVG,
      });
    });
    const feed = await openGlobalFeed(page);
    const cover = feed.locator(
      '.post-card-article-cover .portfolio-writing-cover-photo'
    );
    await expect(cover).toBeVisible();
    await expect
      .poll(() =>
        cover.evaluate((el) => getComputedStyle(el).transitionDuration)
      )
      .toBe('0s');
  });
});
