import { expect, test, type Page } from '@playwright/test';
import { dismissNextDevOverlay, gotoApp } from './helpers';
import { setE2eGraphMarket } from './helpers/e2e-graph';
import { expectMarketChrome } from './helpers/market';
import { E2E_MARKET_CREATOR } from '../src/lib/e2e-graph-stubs';

/**
 * Catalog thumb variants — payload-drop proof for `.market-listing-thumb`
 * catalog rows (Market browse). Each ~78px slot must request the 128 imgproxy
 * rung via srcSet and never the byte-original.
 *
 * The CDN is stubbed: variant responses are tiny decodable SVGs, the
 * original /ipfs route serves a 200KB body — any hit on it fails the test.
 * Every graph query except ScarcesActiveListings is quarantined to
 * `{ data: {} }` so no real thumb URLs can leak in.
 */

const CDN = 'https://cdn.testnet.onsocial.id';
const CID_ALPHA = 'bafkreie2acatal0gthumbalpha000000000000000000000000000000a';
const CID_BETA = 'bafkreie2acatal0gthumbbeta0000000000000000000000000000000b';

const VARIANT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
  `<rect width="8" height="8" fill="#c63"/></svg>`;
const ORIGINAL_BYTES = Buffer.alloc(200_000, 'x');

interface CdnHits {
  variantByWidth: Map<string, number>;
  originalByCid: Map<string, number>;
  originalBytes: number;
}

async function stubCdn(page: Page): Promise<CdnHits> {
  const hits: CdnHits = {
    variantByWidth: new Map(),
    originalByCid: new Map(),
    originalBytes: 0,
  };
  const bump = <K>(map: Map<K, number>, key: K) =>
    map.set(key, (map.get(key) ?? 0) + 1);

  await page.route(`${CDN}/img/*/ipfs/*`, async (route) => {
    const width = new URL(route.request().url()).pathname.split('/')[2]!;
    bump(hits.variantByWidth, width);
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: VARIANT_SVG,
    });
  });
  await page.route(`${CDN}/ipfs/*`, async (route) => {
    const cid = new URL(route.request().url()).pathname.split('/')[2]!;
    bump(hits.originalByCid, cid);
    hits.originalBytes += ORIGINAL_BYTES.length;
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: ORIGINAL_BYTES,
    });
  });
  return hits;
}

function catalogRow(opts: {
  listingKey: string;
  tokenId: string;
  title: string;
  media: string;
  listedBlockTimestamp: number;
}) {
  return {
    listingKey: opts.listingKey,
    kind: 'native',
    listingId: null,
    tokenId: opts.tokenId,
    sellerId: E2E_MARKET_CREATOR,
    creatorId: E2E_MARKET_CREATOR,
    appId: null,
    price: '1000000000000000000000000',
    priceNumeric: 1,
    reservePrice: null,
    buyNowPrice: null,
    highestBid: null,
    bidCount: 0,
    copies: 1,
    remaining: 1,
    mintedCount: 1,
    expiresAt: null,
    title: opts.title,
    media: opts.media,
    sourcePostPath: null,
    cardBg: null,
    extraJson: null,
    mediumKind: 'art',
    audioFormat: null,
    facets: [],
    listedBlockHeight: 1,
    listedBlockTimestamp: opts.listedBlockTimestamp,
    updatedBlockHeight: 1,
    updatedBlockTimestamp: opts.listedBlockTimestamp,
  };
}

async function stubCatalogThumbBrowse(page: Page): Promise<void> {
  const now = Date.now();
  const rows = [
    catalogRow({
      listingKey: 'native:e2e-thumb-alpha',
      tokenId: 'e2e-thumb-alpha:1',
      title: 'e2e-catalog-thumb Alpha Ask',
      media: CID_ALPHA,
      listedBlockTimestamp: now,
    }),
    catalogRow({
      listingKey: 'native:e2e-thumb-beta',
      tokenId: 'e2e-thumb-beta:1',
      title: 'e2e-catalog-thumb Beta Ask',
      media: CID_BETA,
      listedBlockTimestamp: now - 60_000,
    }),
  ];

  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (query.includes('ScarcesActiveListings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { scarcesActiveListings: rows } }),
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

test.describe('catalog thumb variants (market rows)', () => {
  test('listing thumbs pick the 128 rung and never the original', async ({
    page,
  }) => {
    await setE2eGraphMarket(page, 'live-first');
    await stubCatalogThumbBrowse(page);
    const hits = await stubCdn(page);
    await gotoApp(page, '/market');
    await dismissNextDevOverlay(page);
    await expectMarketChrome(page);

    const search = page.getByRole('textbox', {
      name: 'Search Market listings',
    });
    await search.fill('e2e-catalog-thumb');

    const results = page.locator('#market-listing-results');
    const liveRows = results.locator(
      '[data-market-listing-group="live"] .market-listing-row'
    );
    await expect(liveRows).toHaveCount(2, { timeout: 15_000 });

    const thumb = liveRows.first().locator('.market-listing-thumb img');
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveAttribute('src', `${CDN}/ipfs/${CID_ALPHA}`);
    await expect(thumb).toHaveAttribute(
      'srcset',
      new RegExp(`/img/128/ipfs/${CID_ALPHA} 128w`)
    );
    await expect(thumb).toHaveAttribute(
      'srcset',
      new RegExp(`/img/384/ipfs/${CID_ALPHA} 384w`)
    );
    await expect(thumb).toHaveAttribute(
      'sizes',
      '(min-width: 640px) 88px, 78px'
    );
    await expect(thumb).toHaveAttribute('loading', 'lazy');

    const secondThumb = liveRows.nth(1).locator('.market-listing-thumb img');
    await expect(secondThumb).toHaveAttribute(
      'src',
      `${CDN}/ipfs/${CID_BETA}`
    );

    // 88px slot at DPR 1 — the browser picks the 128 rung.
    await expect
      .poll(() => thumb.evaluate((el: HTMLImageElement) => el.currentSrc))
      .toBe(`${CDN}/img/128/ipfs/${CID_ALPHA}`);

    await expect
      .poll(() => hits.variantByWidth.get('128') ?? 0)
      .toBeGreaterThan(0);

    // Payload drop: the byte-original was never requested anywhere.
    expect(hits.originalBytes).toBe(0);
    console.log(
      `[catalog thumbs] variant hits: ${JSON.stringify(
        Object.fromEntries(hits.variantByWidth)
      )} — original bytes: ${hits.originalBytes}`
    );
  });
});
