import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Photo enlarge zoom-from-card. Tapping a card thumbnail flies a cover-cropped
 * clone into the enlarge stage (shared element) instead of a bare opacity pop:
 * the thumbnail hides while the face is up, the real stage image stays parked
 * under the clone until its 1920 variant can paint, and closing flies the
 * clone back before the thumbnail reappears.
 *
 * The CDN stub serves a tiny SVG for every rung but delays the enlarge-face
 * 1920 rung, so the landed-clone hold is observable instead of racy.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_JPEG = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;
const ENLARGE_VARIANT_DELAY_MS = 1_600;

type GraphBody = { query?: string };

const PHOTO_POST = {
  accountId: 'alice.near',
  postId: 'photo-post',
  value: JSON.stringify({
    v: 1,
    text: 'Zoom photo post',
    media: [{ cid: CID_JPEG, mime: 'image/jpeg', size: 200_000 }],
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
  await page.route(`${CDN}/img/*/ipfs/*`, async (route) => {
    const width = new URL(route.request().url()).pathname.split('/')[2]!;
    if (width === '1920') {
      await new Promise((resolve) =>
        setTimeout(resolve, ENLARGE_VARIANT_DELAY_MS)
      );
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: VARIANT_SVG,
    });
  });
  await page.route(`${CDN}/ipfs/*`, async (route) => {
    // Valid 1px GIF so dev servers without variant config still decode.
    await route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
      ),
    });
  });
}

function boxesClose(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
  tolerance = 4
): boolean {
  return (
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

test.describe('feed photo enlarge zoom', () => {
  test('thumbnail clone flies into the stage and back on close', async ({
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
    await expect(feed).toContainText('Zoom photo post');

    const thumb = feed.locator('.post-media-element').first();
    await expect(thumb).toBeVisible();
    await expect
      .poll(() =>
        thumb.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
      )
      .toBe(true);
    const thumbBox = await thumb.boundingBox();
    expect(thumbBox).not.toBeNull();

    await feed.locator('.post-media-tile').first().click();

    // Enter flight: clone layer up, thumbnail hidden, stage media parked.
    const layer = page.locator('.feed-photo-zoom-layer');
    await expect(layer).toBeVisible();
    await expect(page.locator('.feed-photo-slide--zoom-enter')).toBeAttached();
    await expect
      .poll(() => thumb.evaluate((el) => getComputedStyle(el).visibility))
      .toBe('hidden');
    const stageImg = page.locator('.feed-photo-stage > .feed-photo-image');
    await expect(stageImg).toHaveCSS('opacity', '0');

    // The clone lands on the contain-fit rect (square SVG → centered square).
    const clone = page.locator('.feed-photo-zoom-clone');
    await page.waitForTimeout(450);
    const cloneBox = await clone.boundingBox();
    const stageBox = await page
      .locator('.feed-photo-stage')
      .boundingBox();
    expect(cloneBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    const side = Math.min(stageBox!.width, stageBox!.height);
    const expected = {
      left: stageBox!.x + (stageBox!.width - side) / 2,
      top: stageBox!.y + (stageBox!.height - side) / 2,
      width: side,
      height: side,
    };
    expect(
      boxesClose(
        {
          left: cloneBox!.x,
          top: cloneBox!.y,
          width: cloneBox!.width,
          height: cloneBox!.height,
        },
        expected
      )
    ).toBe(true);

    // Delayed 1920 rung arrives → clone swaps for the real stage image.
    await expect(layer).toHaveCount(0, { timeout: 8_000 });
    await expect(stageImg).toHaveCSS('opacity', '1');
    // Thumbnail stays hidden behind the open face.
    await expect
      .poll(() => thumb.evaluate((el) => getComputedStyle(el).visibility))
      .toBe('hidden');

    // Close: the clone flies back, then the thumbnail reappears.
    await page.locator('.os-media-face-close').click();
    await expect(page.locator('.feed-photo-slide--zoom-exit')).toBeAttached({
      timeout: 2_000,
    });
    await expect(layer).toBeAttached();
    await expect
      .poll(() => thumb.evaluate((el) => getComputedStyle(el).visibility))
      .toBe('hidden');
    await expect(layer).toHaveCount(0, { timeout: 4_000 });
    await expect(page.locator('.feed-photo-slide')).toHaveCount(0);
    await expect
      .poll(() => thumb.evaluate((el) => getComputedStyle(el).visibility))
      .toBe('visible');
    const thumbBoxAfter = await thumb.boundingBox();
    expect(thumbBoxAfter).not.toBeNull();
    expect(
      boxesClose(
        {
          left: thumbBoxAfter!.x,
          top: thumbBoxAfter!.y,
          width: thumbBoxAfter!.width,
          height: thumbBoxAfter!.height,
        },
        {
          left: thumbBox!.x,
          top: thumbBox!.y,
          width: thumbBox!.width,
          height: thumbBox!.height,
        },
        1
      )
    ).toBe(true);
  });
});
