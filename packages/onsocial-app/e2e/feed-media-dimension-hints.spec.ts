import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Image-variants phase 4 — upload dimension hints. A post whose MediaRef
 * carries width/height reserves its layout from the hint, not the file:
 * the focused single gets an aspect-ratio box and the 3-up collage picks
 * its hero cell — proven here with every CDN request aborted, so nothing
 * about the layout can come from a decoded image. Hint-less posts keep
 * the legacy measure-on-load behavior.
 */

const CID_A = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const CID_B = 'bafkreigzycy2ojojalo4q6pscc4rpowkqe6mjapvqc4xrcxqlfosu3xqz4';
const CID_C = 'bafkreibxdtzgz3bkffs25wnci6ftdvdmtpt5b42o4kxft6rvyod5il34ii';
const CID_D = 'bafkreidxyztzgz3bkffs25wnci6ftdvdmtpt5b42o4kxft6rvyod5il34zz';

type MediaEntry = { cid: string; mime: string; size: number } & Partial<{
  width: number;
  height: number;
}>;

function feedRow(opts: {
  accountId: string;
  postId: string;
  text: string;
  media: MediaEntry[];
}) {
  return {
    accountId: opts.accountId,
    postId: opts.postId,
    value: JSON.stringify({
      v: 1,
      text: opts.text,
      media: opts.media,
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
    authorAvatar: null,
    groupName: null,
    amplifyHeat: 1,
  };
}

// Single photo with a 16:9 hint — the thread surface must reserve 1600/900.
const SINGLE_HINT = feedRow({
  accountId: 'alice.near',
  postId: 'single-hint',
  text: 'Single hinted photo',
  media: [
    { cid: CID_A, mime: 'image/jpeg', size: 10, width: 1600, height: 900 },
  ],
});

// Trio whose hints demand a TALL hero (all ratios < 1.2, tallest in the
// middle) — the measure-free default would be wide-on-top.
const TRIO_HINT = feedRow({
  accountId: 'alice.near',
  postId: 'trio-hint',
  text: 'Trio hinted photos',
  media: [
    { cid: CID_B, mime: 'image/jpeg', size: 10, width: 1080, height: 1350 },
    { cid: CID_C, mime: 'image/jpeg', size: 10, width: 1080, height: 1920 },
    { cid: CID_D, mime: 'image/jpeg', size: 10, width: 1200, height: 1200 },
  ],
});

// Same shapes without hints — legacy default (wide, first cell on top).
const TRIO_LEGACY = feedRow({
  accountId: 'bob.near',
  postId: 'trio-legacy',
  text: 'Trio legacy photos',
  media: [
    { cid: CID_B, mime: 'image/jpeg', size: 10 },
    { cid: CID_C, mime: 'image/jpeg', size: 10 },
    { cid: CID_D, mime: 'image/jpeg', size: 10 },
  ],
});

async function stubFeedGraph(page: Page): Promise<void> {
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
        body: JSON.stringify({
          data: { [field]: [SINGLE_HINT, TRIO_HINT, TRIO_LEGACY] },
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {} }),
    });
  });
}

async function abortCdn(page: Page): Promise<void> {
  await page.route('https://cdn.testnet.onsocial.id/**', (route) =>
    route.abort()
  );
}

test.describe('feed media dimension hints (phase 4)', () => {
  test('hinted posts reserve their boxes with the CDN unreachable', async ({
    page,
  }) => {
    await stubFeedGraph(page);
    await abortCdn(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) {
      await globalTab.click();
    }
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Single hinted photo');
    await expect(feed).toContainText('Trio hinted photos');
    await expect(feed).toContainText('Trio legacy photos');

    // 3-up hinted collage: the tall hero lands on the middle cell from the
    // hints alone (CDN aborted — no image ever decodes). Legacy trio keeps
    // the unknown-ratio default: wide, first cell on top.
    const hintedStrip = feed.locator('.post-media-strip--3').first();
    await expect(hintedStrip).toHaveClass(/is-tall/);
    const hintedHeroCell = hintedStrip.locator('.post-media-tile').nth(1);
    await expect
      .poll(() =>
        hintedHeroCell.evaluate((el: HTMLElement) => el.style.gridRow)
      )
      .toBe('1 / -1');
    const legacyStrip = feed.locator('.post-media-strip--3').nth(1);
    await expect(legacyStrip).toHaveClass(/is-wide/);
    await expect(legacyStrip).not.toHaveClass(/is-tall/);

    // Feed singles stay the fixed 4/3 design frame — no inline ratio.
    const compactTile = feed.locator('.post-media-tile--compact').first();
    await expect
      .poll(() =>
        compactTile.evaluate((el: HTMLElement) => el.style.aspectRatio)
      )
      .toBe('');

    // Open the single hinted photo in the thread drawer: the focused tile
    // reserves the intrinsic box straight from the MediaRef hints.
    await feed
      .getByRole('link', { name: 'Open post' })
      .first()
      .dispatchEvent('click');
    const drawer = page.locator('.post-thread-sheet-panel');
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    const focusedTile = drawer.locator('.post-media-tile').first();
    await expect(focusedTile).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(
        () => focusedTile.evaluate((el: HTMLElement) => el.style.aspectRatio),
        { timeout: 10_000 }
      )
      .toBe('1600 / 900');
  });
});
