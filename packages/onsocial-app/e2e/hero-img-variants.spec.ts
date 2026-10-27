import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import {
  collectionPageRoot,
  expectCollectionPageSettled,
} from './helpers/collection-page';

/**
 * Wide scarce heroes — payload-drop proof for the g7 adoption: collection
 * covers, hub banners, writing/read + listen/player covers, feed scarce
 * previews, and the DropArtOverlay stage mounted full-size originals with
 * no srcSet. Hero slots now request the 384/1080 imgproxy rungs (overlay
 * 1080/1920) via srcSet and never the byte-original.
 *
 * The CDN is stubbed: variant responses are tiny decodable SVGs, the
 * original /ipfs route serves a 200KB body — any hit on it fails the test.
 * Every graph query except the collection fetch is quarantined to
 * `{ data: {} }` so no real cover URLs can leak in.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_HERO = 'bafkreie2ahero000gcoveralpha000000000000000000000000000000a';
const COLLECTION_ID = 'e2e-hero-art';

const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#36c"/></svg>`;
const ORIGINAL_BYTES = Buffer.alloc(200_000, 'x');

interface CdnHits {
  variantByWidth: Map<string, number>;
  originalBytes: number;
}

async function stubCdn(page: Page): Promise<CdnHits> {
  const hits: CdnHits = { variantByWidth: new Map(), originalBytes: 0 };
  const bump = (key: string) =>
    hits.variantByWidth.set(key, (hits.variantByWidth.get(key) ?? 0) + 1);

  await page.route(`${CDN}/img/*/ipfs/*`, async (route) => {
    const width = new URL(route.request().url()).pathname.split('/')[2]!;
    bump(width);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: VARIANT_SVG,
    });
  });
  await page.route(`${CDN}/ipfs/*`, async (route) => {
    hits.originalBytes += ORIGINAL_BYTES.length;
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: ORIGINAL_BYTES,
    });
  });
  return hits;
}

function heroArtCollectionRow() {
  const title = 'e2e-hero-art Canvas';
  return {
    collectionId: COLLECTION_ID,
    creatorId: 'alice.near',
    appId: null,
    price: '2000000000000000000000000',
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: 8,
    startTime: null,
    endTime: null,
    createdAt: 1_700_000_000_000,
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
    title,
    media: null,
    description: null,
    kind: 'art',
    mediumKind: 'art',
    sourcePostPath: null,
    metadataTemplate: JSON.stringify({
      title,
      media: `${CDN}/ipfs/${CID_HERO}`,
      extra: JSON.stringify({ kind: 'art' }),
    }),
    metadata: null,
    extraJson: JSON.stringify({ kind: 'art' }),
  };
}

async function stubHeroArtCollection(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (
      query.includes('ScarcesCollectionCurrent') &&
      !query.includes('ScarcesCollectionsCurrent')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: [heroArtCollectionRow()] },
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
}

test.describe('wide hero variants (collection cover + overlay)', () => {
  test('hero picks the 1080 rung, overlay the 1920 ladder, never the original', async ({
    page,
  }) => {
    await stubHeroArtCollection(page);
    const hits = await stubCdn(page);
    await gotoApp(page, `/collection/${COLLECTION_ID}`);
    await dismissNextDevOverlay(page);
    await expectCollectionPageSettled(page);

    const hero = collectionPageRoot(page).locator('.collection-cover img');
    await expect(hero).toBeVisible({ timeout: 15_000 });
    await expect(hero).toHaveAttribute('src', `${CDN}/ipfs/${CID_HERO}`);
    await expect(hero).toHaveAttribute(
      'srcset',
      new RegExp(`/img/384/ipfs/${CID_HERO} 384w`)
    );
    await expect(hero).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1080/ipfs/${CID_HERO} 1080w`)
    );
    await expect(hero).toHaveAttribute(
      'sizes',
      '(min-width: 640px) 608px, 100vw'
    );

    // ~608px app-column slot at DPR 1 — the browser picks the 1080 rung.
    await expect
      .poll(() => hero.evaluate((el: HTMLImageElement) => el.currentSrc))
      .toBe(`${CDN}/img/1080/ipfs/${CID_HERO}`);

    // The full-cover overlay climbs to the 1080/1920 ladder.
    await collectionPageRoot(page)
      .getByRole('button', { name: 'View full cover' })
      .click();
    const overlay = page.locator('.drop-art-overlay-asset');
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1080/ipfs/${CID_HERO} 1080w`)
    );
    await expect(overlay).toHaveAttribute(
      'srcset',
      new RegExp(`/img/1920/ipfs/${CID_HERO} 1920w`)
    );
    await expect(overlay).toHaveAttribute('sizes', '100vmin');
    await expect
      .poll(() => overlay.evaluate((el: HTMLImageElement) => el.currentSrc))
      .toMatch(new RegExp(`^${CDN}/img/(1080|1920)/ipfs/${CID_HERO}$`));

    await expect
      .poll(() => hits.variantByWidth.get('1080') ?? 0)
      .toBeGreaterThan(0);

    // Payload drop: the byte-original was never requested anywhere.
    expect(hits.originalBytes).toBe(0);
    console.log(
      `[hero variants] variant hits: ${JSON.stringify(
        Object.fromEntries(hits.variantByWidth)
      )} — original bytes: ${hits.originalBytes}`
    );
  });
});
