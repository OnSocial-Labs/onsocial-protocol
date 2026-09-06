import { expect, type Page } from '@playwright/test';
import { E2E_CHROME_TIMEOUT_MS } from './navigation';
import {
  expectSearchVisible,
  expectTabSelected,
  expectTabVisible,
} from './tabs';
import { marketFilterTrigger, openMarketFilter } from './market';

const TWO_NEAR_YOCTO = '2000000000000000000000000';

const VAULT_OWNER = 'greenghost.onsocial.testnet';

function collectionRow(opts: {
  collectionId: string;
  creatorId: string;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
  series?: { id: string; title: string };
}) {
  return {
    collectionId: opts.collectionId,
    creatorId: opts.creatorId,
    appId: null,
    price: TWO_NEAR_YOCTO,
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: 8,
    startTime: null,
    endTime: null,
    createdAt: null,
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
    title: opts.title,
    media: null,
    description: null,
    kind: opts.kind,
    mediumKind: opts.kind,
    sourcePostPath: null,
    metadataTemplate: JSON.stringify({
      title: opts.title,
      extra: JSON.stringify({ kind: opts.kind, ...opts.extra }),
    }),
    metadata: opts.series
      ? JSON.stringify({ series: opts.series })
      : null,
    extraJson: JSON.stringify({
      kind: opts.kind,
      ...opts.extra,
      ...(opts.series ? { series: opts.series } : {}),
    }),
    royaltyJson: null,
    createdBlockHeight: 1,
    createdBlockTimestamp: 1,
    updatedBlockHeight: 1,
    updatedBlockTimestamp: 1,
  };
}

/**
 * Intercept browser GraphQL so the vault can render without a live API key.
 * Covers owned tokens, collection catalog, and one listed resale.
 */
export async function stubCollectiblesVaultGraph(page: Page): Promise<void> {
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (query.includes('ScarcesOwnedBy')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesTokenOwners: [
              {
                tokenId: 'night-drive:3',
                ownerId: VAULT_OWNER,
                burned: false,
                collectionId: 'night-drive',
                appId: null,
                mintedBlockTimestamp: 1,
                updatedBlockTimestamp: 3,
              },
              {
                tokenId: 'night-drive:1',
                ownerId: VAULT_OWNER,
                burned: false,
                collectionId: 'night-drive',
                appId: null,
                mintedBlockTimestamp: 1,
                updatedBlockTimestamp: 2,
              },
              {
                tokenId: 'chapter-one:4',
                ownerId: VAULT_OWNER,
                burned: false,
                collectionId: 'chapter-one',
                appId: null,
                mintedBlockTimestamp: 1,
                updatedBlockTimestamp: 1,
              },
              {
                tokenId: 'dusk-run:1',
                ownerId: VAULT_OWNER,
                burned: false,
                collectionId: 'dusk-run',
                appId: null,
                mintedBlockTimestamp: 1,
                updatedBlockTimestamp: 4,
              },
              {
                tokenId: 'gate-pass:2',
                ownerId: VAULT_OWNER,
                burned: false,
                collectionId: 'gate-pass',
                appId: null,
                mintedBlockTimestamp: 1,
                updatedBlockTimestamp: 5,
              },
            ],
          },
        }),
      });
      return;
    }

    if (query.includes('ScarcesCollectionsCurrentByIds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesCollectionsCurrent: [
              collectionRow({
                collectionId: 'night-drive',
                creatorId: 'alice.near',
                title: 'Night Drive',
                kind: 'audio',
                extra: { audioFormat: 'album' },
                series: { id: 'night-roads', title: 'Night Roads' },
              }),
              collectionRow({
                collectionId: 'dusk-run',
                creatorId: 'alice.near',
                title: 'Dusk Run',
                kind: 'audio',
                extra: { audioFormat: 'single' },
                series: { id: 'night-roads', title: 'Night Roads' },
              }),
              collectionRow({
                collectionId: 'chapter-one',
                creatorId: 'alice.near',
                title: 'Chapter One',
                kind: 'writing',
              }),
              collectionRow({
                collectionId: 'gate-pass',
                creatorId: 'bob.near',
                title: 'Gate Pass',
                kind: 'ticket',
              }),
            ],
          },
        }),
      });
      return;
    }

    if (query.includes('ScarcesActiveListings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesActiveListings: [
              {
                listingKey: 'native:night-drive:3',
                kind: 'native',
                listingId: null,
                tokenId: 'night-drive:3',
                sellerId: VAULT_OWNER,
                creatorId: 'alice.near',
                appId: null,
                price: TWO_NEAR_YOCTO,
                priceNumeric: 2,
                reservePrice: null,
                buyNowPrice: null,
                highestBid: null,
                bidCount: 0,
                copies: 1,
                remaining: 1,
                mintedCount: 1,
                expiresAt: null,
                title: 'Night Drive',
                media: null,
                sourcePostPath: null,
                cardBg: null,
                extraJson: null,
                mediumKind: 'audio',
                audioFormat: 'album',
                facets: [],
                listedBlockHeight: 1,
                listedBlockTimestamp: 1,
                updatedBlockHeight: 1,
                updatedBlockTimestamp: 1,
              },
            ],
          },
        }),
      });
      return;
    }

    await route.continue();
  });
}

/** Six creators so the vault jump rail appears. */
export async function stubCollectiblesVaultManyCreators(
  page: Page
): Promise<void> {
  const creators = [
    'alice.near',
    'bob.near',
    'cara.near',
    'drew.near',
    'erin.near',
    'finn.near',
  ];
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (query.includes('ScarcesOwnedBy')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesTokenOwners: creators.map((creatorId, index) => ({
              tokenId: `drop-${index}:1`,
              ownerId: VAULT_OWNER,
              burned: false,
              collectionId: `drop-${index}`,
              appId: null,
              mintedBlockTimestamp: 1,
              updatedBlockTimestamp: index + 1,
            })),
          },
        }),
      });
      return;
    }

    if (query.includes('ScarcesCollectionsCurrentByIds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesCollectionsCurrent: creators.map((creatorId, index) =>
              collectionRow({
                collectionId: `drop-${index}`,
                creatorId,
                title: `Drop ${index + 1}`,
                kind: 'audio',
                extra: { audioFormat: 'single' },
              })
            ),
          },
        }),
      });
      return;
    }

    if (query.includes('ScarcesActiveListings')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { scarcesActiveListings: [] } }),
      });
      return;
    }

    await route.continue();
  });
}

export const COLLECTIBLES_VAULT_OWNER = VAULT_OWNER;

export function collectiblesReadyRail(page: Page) {
  return page.locator('[data-collectibles-ready]');
}

export async function expectCollectiblesChrome(page: Page): Promise<void> {
  await expectSearchVisible(page, 'Search collectibles');
  await expect(collectiblesReadyRail(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
  await expect(collectiblesReadyRail(page)).toHaveCount(1);
  await expect(page.locator('[data-collectibles-loading]')).toHaveCount(0);
  await expectTabVisible(page, 'Collectible kind', 'All');
  await expect(
    collectiblesReadyRail(page).getByRole('tab', { name: 'Memberships' })
  ).toHaveCount(0);
  await expect(
    collectiblesReadyRail(page).getByRole('tab', { name: 'All' })
  ).toBeEnabled({ timeout: E2E_CHROME_TIMEOUT_MS });
  await expect(marketFilterTrigger(page)).toBeVisible({
    timeout: E2E_CHROME_TIMEOUT_MS,
  });
}

/** Click a kind chip on the ready rail — retries until the URL matches. */
export async function clickCollectiblesKindAndWaitUrl(
  page: Page,
  name: string,
  kind: string | null
): Promise<void> {
  const chip = collectiblesReadyRail(page).getByRole('tab', { name });
  await expect(async () => {
    await chip.click();
    expect(new URL(page.url()).searchParams.get('kind')).toBe(kind);
  }).toPass({ timeout: E2E_CHROME_TIMEOUT_MS });
  if (kind == null) {
    await expectTabSelected(page, 'Collectible kind', 'All');
    return;
  }
  await expectTabSelected(page, 'Collectible kind', name);
}

/** Kind not on the held rail — pick it from Filter so the URL still updates. */
export async function pickCollectiblesKindFromFilter(
  page: Page,
  name: string,
  kind: string
): Promise<void> {
  await openMarketFilter(page);
  await page
    .getByRole('listbox', { name: 'Medium' })
    .getByRole('option', { name })
    .click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForURL(
    (url) => url.searchParams.get('kind') === kind,
    { timeout: E2E_CHROME_TIMEOUT_MS }
  );
}
