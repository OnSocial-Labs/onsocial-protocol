import type { Page } from '@playwright/test';

const TWO_NEAR_YOCTO = '2000000000000000000000000';

function collectionRow(opts: {
  collectionId: string;
  creatorId: string;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
  endTime?: number | null;
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
    endTime: opts.endTime ?? null,
    createdAt: Date.now() - 86_400_000,
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
    extraJson: JSON.stringify({
      kind: opts.kind,
      ...opts.extra,
    }),
    royaltyJson: null,
    createdBlockHeight: 1,
    createdBlockTimestamp: 1,
    updatedBlockHeight: 1,
    updatedBlockTimestamp: 1,
  };
}

/** Browser GraphQL for creator shop — listings + primary drops. */
export async function stubMarketCreatorShop(
  page: Page,
  opts?: {
    creatorId?: string;
    drops?: 'night-drive' | 'empty';
    listings?: 'empty';
    catalogDelayMs?: number;
  }
): Promise<void> {
  const creatorId = opts?.creatorId ?? 'e2e.market.testnet';
  const drops = opts?.drops ?? 'empty';
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
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
        body: JSON.stringify({ data: { scarcesActiveListings: [] } }),
      });
      return;
    }

    if (
      query.includes('ScarcesCollectionsCurrent') &&
      !query.includes('ScarcesCollectionsCurrentByIds')
    ) {
      if (catalogDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, catalogDelayMs));
      }
      const catalog =
        drops === 'night-drive'
          ? [
              collectionRow({
                collectionId: 'night-drive',
                creatorId,
                title: 'Night Drive',
                kind: 'audio',
                extra: { audioFormat: 'album' },
              }),
              collectionRow({
                collectionId: 'quiet-print',
                creatorId,
                title: 'Quiet Print',
                kind: 'art',
                endTime: Date.now() - 86_400_000,
              }),
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { scarcesCollectionsCurrent: catalog },
        }),
      });
      return;
    }

    await route.continue();
  });
}
