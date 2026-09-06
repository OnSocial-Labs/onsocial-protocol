import type { Page } from '@playwright/test';

const ONE_NEAR_YOCTO = '1000000000000000000000000';
const SIX_TENTHS_NEAR_YOCTO = '600000000000000000000000';

function listingRow(opts: {
  listingKey: string;
  kind: 'native' | 'auction';
  tokenId: string;
  title: string;
  price: string;
  priceNumeric: number;
  listedBlockTimestamp: number;
  expiresAt?: number | null;
  highestBid?: string | null;
  bidCount?: number;
}) {
  return {
    listingKey: opts.listingKey,
    kind: opts.kind,
    listingId: null,
    tokenId: opts.tokenId,
    sellerId: 'e2e.market.testnet',
    creatorId: 'e2e.market.testnet',
    appId: null,
    price: opts.price,
    priceNumeric: opts.priceNumeric,
    reservePrice: opts.kind === 'auction' ? opts.price : null,
    buyNowPrice: null,
    highestBid: opts.highestBid ?? null,
    bidCount: opts.bidCount ?? 0,
    copies: 1,
    remaining: 1,
    mintedCount: 1,
    expiresAt: opts.expiresAt ?? null,
    title: opts.title,
    media: null,
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

/** Newest row is an ended auction so live-first rank has to move it. */
export async function stubMarketLiveFirstBrowse(page: Page): Promise<void> {
  const now = Date.now();
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
        body: JSON.stringify({
          data: {
            scarcesActiveListings: [
              listingRow({
                listingKey: 'auction:e2e-ended',
                kind: 'auction',
                tokenId: 'e2e-ended:1',
                title: 'e2e-live-first Ended Lot',
                price: SIX_TENTHS_NEAR_YOCTO,
                priceNumeric: 0.6,
                listedBlockTimestamp: now,
                expiresAt: now - 3_600_000,
                highestBid: SIX_TENTHS_NEAR_YOCTO,
                bidCount: 1,
              }),
              listingRow({
                listingKey: 'native:e2e-live',
                kind: 'native',
                tokenId: 'e2e-live:1',
                title: 'e2e-live-first Live Ask',
                price: ONE_NEAR_YOCTO,
                priceNumeric: 1,
                listedBlockTimestamp: now - 86_400_000,
              }),
            ],
          },
        }),
      });
      return;
    }

    await route.continue();
  });
}
