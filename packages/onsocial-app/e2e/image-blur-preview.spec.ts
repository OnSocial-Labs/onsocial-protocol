import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * While a feed photo or avatar loads, the 128px resize paints blurred in
 * the slot. The full image fades in over it. Reduced motion skips that fade.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_JPEG = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const CID_GIF = 'bafkreigzycy2ojojalo4q6pscc4rpowkqe6mjapvqc4xrcxqlfosu3xqz4';
const CID_AVATAR =
  'bafkreibxdtzgz3bkffs25wnci6ftdvdmtpt5b42o4kxft6rvyod5il34ii';

const PREVIEW_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#e8a317"/></svg>`;
const FULL_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#1d4ed8"/></svg>`;
const GIF_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

type GraphBody = { query?: string };

function feedRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  media?: Array<{ cid: string; mime: string; size: number }>;
  authorAvatar?: string | null;
}) {
  return {
    accountId: opts.accountId,
    postId: opts.postId,
    value: JSON.stringify({
      v: 1,
      text: opts.text,
      ...(opts.media ? { media: opts.media } : {}),
    }),
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
    authorAvatar: opts.authorAvatar ?? null,
    groupName: null,
    amplifyHeat: 1,
  };
}

const PHOTO_POST = feedRow({
  accountId: 'alice.near',
  postId: 'photo-post',
  text: 'Photo post',
  media: [{ cid: CID_JPEG, mime: 'image/jpeg', size: 200_000 }],
  authorAvatar: `${CDN}/ipfs/${CID_AVATAR}`,
});
const GIF_POST = feedRow({
  accountId: 'bob.near',
  postId: 'gif-post',
  text: 'Gif post',
  media: [{ cid: CID_GIF, mime: 'image/gif', size: 3_000 }],
});

async function stubFeedGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: [PHOTO_POST, GIF_POST] } }),
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

async function stubCdn(page: Page, holdFull: Promise<void>): Promise<void> {
  await page.route(`${CDN}/img/*/ipfs/*`, async (route) => {
    const width = new URL(route.request().url()).pathname.split('/')[2] ?? '';
    if (width !== '128') await holdFull;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: width === '128' ? PREVIEW_SVG : FULL_SVG,
    });
  });
  await page.route(`${CDN}/ipfs/*`, async (route) => {
    const cid = new URL(route.request().url()).pathname.split('/')[2] ?? '';
    if (cid === CID_GIF) {
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: GIF_BYTES,
      });
      return;
    }
    await holdFull;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: FULL_SVG,
    });
  });
}

async function openGlobalFeed(page: Page) {
  await gotoApp(page, '/home');
  await dismissNextDevOverlay(page);
  const globalTab = page.getByRole('tab', { name: 'Global' });
  if ((await globalTab.count()) > 0) {
    await globalTab.click();
  }
  const feed = page.locator('.home-feed-list');
  await expect(feed).toContainText('Photo post');
  return feed;
}

test.describe('blurred preview while images load', () => {
  test('feed photo and avatar show the 128px variant until the full image arrives', async ({
    page,
  }) => {
    let releaseFull = () => {};
    const holdFull = new Promise<void>((resolve) => {
      releaseFull = resolve;
    });
    await stubFeedGraph(page);
    await stubCdn(page, holdFull);
    const feed = await openGlobalFeed(page);

    const photo = feed.locator('.post-media-tile').first();
    const preview = photo.locator('.ipfs-blur-preview');
    const full = photo.locator('.post-media-element');

    await expect(preview).toHaveAttribute(
      'src',
      `${CDN}/img/128/ipfs/${CID_JPEG}`
    );
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(full).not.toHaveClass(/is-resolved/);
    await expect
      .poll(() => preview.evaluate((el) => getComputedStyle(el).filter))
      .toContain('blur');
    await expect
      .poll(() => full.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('0');

    const avatar = feed
      .locator('.profile-avatar')
      .filter({
        has: page.locator(
          `.profile-avatar__img[src="${CDN}/ipfs/${CID_AVATAR}"]`
        ),
      })
      .first();
    await expect(avatar.locator('.ipfs-blur-preview')).toHaveAttribute(
      'src',
      `${CDN}/img/128/ipfs/${CID_AVATAR}`
    );
    await expect(avatar.locator('.profile-avatar__img')).toHaveAttribute(
      'src',
      `${CDN}/ipfs/${CID_AVATAR}`
    );

    const gif = feed.locator('.post-media-tile').nth(1);
    await expect(gif.locator('.ipfs-blur-preview')).toHaveCount(0);

    releaseFull();
    await expect(full).toHaveClass(/is-resolved/, { timeout: 15_000 });
    await expect
      .poll(() => full.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
  });

  test('reduced motion skips the feed crossfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let releaseFull = () => {};
    const holdFull = new Promise<void>((resolve) => {
      releaseFull = resolve;
    });
    await stubFeedGraph(page);
    await stubCdn(page, holdFull);
    const feed = await openGlobalFeed(page);
    const full = feed.locator('.post-media-element').first();

    await expect
      .poll(() =>
        full.evaluate((el) => getComputedStyle(el).transitionDuration)
      )
      .toBe('0s');

    releaseFull();
    await expect(full).toHaveClass(/is-resolved/, { timeout: 15_000 });
  });
});
