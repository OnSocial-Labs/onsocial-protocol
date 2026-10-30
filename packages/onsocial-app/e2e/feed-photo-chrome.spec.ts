import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * A still on the photo face tucks jacket, caption, and footer on tap,
 * the same quiet chrome a video already uses. A second tap or Escape
 * brings them back. The face stays open.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_JPEG = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;

type GraphBody = { query?: string };

const PHOTO_POST = {
  accountId: 'alice.near',
  postId: 'quiet-photo-post',
  value: JSON.stringify({
    v: 1,
    text: 'Quiet photo post',
    media: [{ cid: CID_JPEG, mime: 'image/jpeg', size: 200_000 }],
  }),
  blockHeight: 200,
  blockTimestamp: 1_700_000_000,
  receiptId: 'receipt-quiet-photo-post',
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

async function stubFeedGraph(page: Page): Promise<void> {
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
}

async function stubCdn(page: Page): Promise<void> {
  await page.route(`${CDN}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: VARIANT_SVG,
    });
  });
}

test.describe('feed photo chrome', () => {
  test('tapping a picture hides the face chrome and a second tap brings it back', async ({
    page,
  }) => {
    await stubFeedGraph(page);
    await stubCdn(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) {
      await globalTab.click();
    }
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Quiet photo post');
    await feed.locator('.post-media-tile').first().click();

    const slide = page.locator('.feed-photo-slide');
    const hero = slide.locator('.os-media-face-hero');
    const caption = slide.locator('.feed-photo-caption');
    const image = slide.locator('.feed-photo-image');
    await expect(slide).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.feed-photo-zoom-layer')).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect(hero).toHaveCSS('opacity', '1');
    await expect(caption).toBeVisible();

    await image.click();
    await expect(slide).toHaveClass(/is-chrome-quiet/);
    await expect(hero).toHaveCSS('opacity', '0');
    await expect(caption).toHaveCSS('opacity', '0');
    await expect(slide.locator('.os-media-face-footer')).toHaveCSS(
      'opacity',
      '0'
    );

    await image.click();
    await expect(slide).not.toHaveClass(/is-chrome-quiet/);
    await expect(hero).toHaveCSS('opacity', '1');
    await expect(caption).toHaveCSS('opacity', '1');

    await image.click();
    await expect(slide).toHaveClass(/is-chrome-quiet/);
    await page.keyboard.press('Escape');
    await expect(slide).toBeVisible();
    await expect(slide).not.toHaveClass(/is-chrome-quiet/);
    await expect(hero).toHaveCSS('opacity', '1');
  });
});
