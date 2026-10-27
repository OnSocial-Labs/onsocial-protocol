import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';

/**
 * Image-variants phase 2 — payload-drop proof. The feed must request the
 * imgproxy variant rung for its slot, never the byte-original: tile → 1080
 * (553px slot at DPR 1), avatar → 128, enlarge → 1920 (100vw at 1280).
 * GIFs bypass variants entirely (D3) and keep the original /ipfs URL.
 *
 * The CDN is stubbed: variant responses are tiny decodable SVGs, the
 * original /ipfs route serves a 200KB body — any hit on it fails the test
 * for the JPEG/avatar CIDs.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_JPEG = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const CID_GIF = 'bafkreigzycy2ojojalo4q6pscc4rpowkqe6mjapvqc4xrcxqlfosu3xqz4';
const CID_AVATAR =
  'bafkreibxdtzgz3bkffs25wnci6ftdvdmtpt5b42o4kxft6rvyod5il34ii';

const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;
const GIF_BYTES = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
const ORIGINAL_BYTES = Buffer.alloc(200_000, 'x');

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
  media: [{ cid: CID_GIF, mime: 'image/gif', size: 3_000_000 }],
});

function articleRow(opts: {
  accountId: string;
  postId: string;
  title: string;
  text: string;
  media?: Array<{ cid: string; mime: string; size: number }>;
}) {
  return {
    ...feedRow({
      accountId: opts.accountId,
      postId: opts.postId,
      text: opts.text,
      media: opts.media,
    }),
    value: JSON.stringify({
      v: 1,
      contentType: 'md',
      kind: 'longform',
      text: opts.text,
      ...(opts.media ? { media: opts.media } : {}),
      x: { onsocial: { article: { title: opts.title } } },
    }),
  };
}

const ARTICLE_POST = articleRow({
  accountId: 'carol.near',
  postId: 'article-post',
  title: 'Tale of the Blurred Cover',
  text: 'A long-form story whose photo cover must stay sharp in the feed.',
  media: [{ cid: CID_JPEG, mime: 'image/jpeg', size: 200_000 }],
});

async function stubFeedGraph(
  page: Page,
  rows: unknown[] = [PHOTO_POST, GIF_POST]
): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as GraphBody;
    const query = body.query ?? '';
    if (query.includes('postsFeed') || query.includes('postsCurrent')) {
      const field = query.includes('postsFeed') ? 'postsFeed' : 'postsCurrent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [field]: rows } }),
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

interface CdnHits {
  variantByWidth: Map<string, number>;
  originalByCid: Map<string, number>;
  variantBytes: number;
  originalBytes: number;
}

async function stubCdn(page: Page): Promise<CdnHits> {
  const hits: CdnHits = {
    variantByWidth: new Map(),
    originalByCid: new Map(),
    variantBytes: 0,
    originalBytes: 0,
  };
  const bump = <K>(map: Map<K, number>, key: K) =>
    map.set(key, (map.get(key) ?? 0) + 1);

  await page.route(`${CDN}/img/*/ipfs/*`, async (route) => {
    const width = new URL(route.request().url()).pathname.split('/')[2]!;
    bump(hits.variantByWidth, width);
    hits.variantBytes += VARIANT_SVG.length;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: VARIANT_SVG,
    });
  });
  await page.route(`${CDN}/ipfs/*`, async (route) => {
    const cid = new URL(route.request().url()).pathname.split('/')[2]!;
    bump(hits.originalByCid, cid);
    if (cid === CID_GIF) {
      hits.originalBytes += GIF_BYTES.length;
      await route.fulfill({
        status: 200,
        contentType: 'image/gif',
        body: GIF_BYTES,
      });
      return;
    }
    hits.originalBytes += ORIGINAL_BYTES.length;
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: ORIGINAL_BYTES,
    });
  });
  return hits;
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
  await expect(feed).toContainText('Gif post');
  return feed;
}

test.describe('feed image variants (phase 2)', () => {
  test('tiles, avatars, and enlarge load variant rungs — originals stay untouched', async ({
    page,
  }) => {
    await stubFeedGraph(page);
    const hits = await stubCdn(page);
    const feed = await openGlobalFeed(page);

    const tiles = feed.locator('.post-media-element');
    const photoTile = tiles.first();

    // Tile src keeps the byte-original fallback (D4); srcSet offers rungs.
    await expect(photoTile).toHaveAttribute('src', `${CDN}/ipfs/${CID_JPEG}`);
    await expect(photoTile).toHaveAttribute(
      'srcset',
      new RegExp(`/img/384/ipfs/${CID_JPEG} 384w`)
    );
    await expect(photoTile).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1080/ipfs/${CID_JPEG} 1080w`)
    );
    await expect(photoTile).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1920/ipfs/${CID_JPEG} 1920w`)
    );
    await expect(photoTile).toHaveAttribute(
      'sizes',
      '(min-width: 640px) 553px, 100vw'
    );

    // The browser picks the 1080 rung for the 553px slot at DPR 1 — and the
    // original is never requested.
    await expect
      .poll(() => hits.variantByWidth.get('1080') ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => photoTile.evaluate((el: HTMLImageElement) => el.currentSrc))
      .toContain(`/img/1080/ipfs/${CID_JPEG}`);
    expect(hits.originalByCid.get(CID_JPEG) ?? 0).toBe(0);

    // Avatar rides the 128 rung (32px slot at DPR 1).
    const avatar = feed.locator('.profile-avatar__img').first();
    await expect(avatar).toHaveAttribute(
      'srcset',
      new RegExp(`/img/128/ipfs/${CID_AVATAR} 128w`)
    );
    await expect
      .poll(() => hits.variantByWidth.get('128') ?? 0)
      .toBeGreaterThan(0);
    expect(hits.originalByCid.get(CID_AVATAR) ?? 0).toBe(0);

    // GIF bypasses variants (D3): no srcSet, original URL fetched.
    const gifTile = tiles.nth(1);
    expect(await gifTile.getAttribute('srcset')).toBeNull();
    await expect
      .poll(() => hits.originalByCid.get(CID_GIF) ?? 0)
      .toBeGreaterThan(0);
    await expect
      .poll(() => gifTile.evaluate((el: HTMLImageElement) => el.currentSrc))
      .toBe(`${CDN}/ipfs/${CID_GIF}`);

    // Enlarge overlay (opened from the thread surface) takes the 1920 rung.
    // The card hit link sits under the media tile — dispatch the click
    // directly instead of pointer-clicking through the tile.
    await feed
      .getByRole('link', { name: 'Open post' })
      .first()
      .dispatchEvent('click');
    const drawer = page.locator('.post-thread-sheet-panel');
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await drawer.locator('.post-media-tile').first().click();
    const enlargeImg = page.locator('.feed-photo-image').first();
    await expect(enlargeImg).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(
        () => enlargeImg.evaluate((el: HTMLImageElement) => el.currentSrc),
        { timeout: 15_000 }
      )
      .toContain(`/img/1920/ipfs/${CID_JPEG}`);

    // Payload drop: only tiny variant bodies moved for the JPEG + avatar.
    expect(hits.originalBytes).toBeLessThan(1_000); // GIF passthrough only
    expect(hits.originalByCid.get(CID_JPEG) ?? 0).toBe(0);
    expect(hits.originalByCid.get(CID_AVATAR) ?? 0).toBe(0);
    console.log(
      `[variants] variant hits: ${JSON.stringify(
        Object.fromEntries(hits.variantByWidth)
      )} (${hits.variantBytes}B served) — original bytes: ${hits.originalBytes}`
    );
  });

  // Regression: feed article covers rendered with the `list` variant and
  // fetched the 128px catalog rung into the wide cover slot — visibly
  // blurred on live posts (e.g. "Tale of Merwuszek and the Silver Forest").
  test('article photo cover loads the wide-cover rung, never the 128 thumb', async ({
    page,
  }) => {
    await stubFeedGraph(page, [ARTICLE_POST]);
    const hits = await stubCdn(page);
    await gotoApp(page, '/home');
    await dismissNextDevOverlay(page);
    const globalTab = page.getByRole('tab', { name: 'Global' });
    if ((await globalTab.count()) > 0) {
      await globalTab.click();
    }
    const feed = page.locator('.home-feed-list');
    await expect(feed).toContainText('Tale of the Blurred Cover');

    const cover = feed.locator(
      '.post-card-article-cover .portfolio-writing-cover-photo'
    );
    await expect(cover).toBeVisible();

    // Wide-cover rungs + sizes — the 128px list-thumb rung stays out.
    await expect(cover).toHaveAttribute(
      'srcset',
      new RegExp(`/img/384/ipfs/${CID_JPEG} 384w`)
    );
    await expect(cover).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1080/ipfs/${CID_JPEG} 1080w`)
    );
    const srcset = await cover.getAttribute('srcset');
    expect(srcset).not.toContain('/img/128/');
    await expect(cover).toHaveAttribute(
      'sizes',
      '(max-width: 640px) 100vw, 608px'
    );

    // Browser resolves the 1080 rung for the ~553px slot; thumb + original
    // are never requested.
    await expect
      .poll(() => cover.evaluate((el: HTMLImageElement) => el.currentSrc), {
        timeout: 15_000,
      })
      .toContain(`/img/1080/ipfs/${CID_JPEG}`);
    expect(hits.variantByWidth.get('128') ?? 0).toBe(0);
    expect(hits.originalByCid.get(CID_JPEG) ?? 0).toBe(0);
  });
});
