import type { Page } from '@playwright/test';

const TWO_NEAR_YOCTO = '2000000000000000000000000';

const VAULT_OWNER = 'greenghost.onsocial.testnet';

function collectionRow(opts: {
  collectionId: string;
  creatorId: string;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
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
    metadata: null,
    extraJson: JSON.stringify({ kind: opts.kind, ...opts.extra }),
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
              }),
              collectionRow({
                collectionId: 'chapter-one',
                creatorId: 'alice.near',
                title: 'Chapter One',
                kind: 'writing',
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

export const COLLECTIBLES_VAULT_OWNER = VAULT_OWNER;
