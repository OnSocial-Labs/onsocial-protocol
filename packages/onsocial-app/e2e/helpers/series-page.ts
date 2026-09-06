import type { Page } from '@playwright/test';

const TWO_NEAR_YOCTO = '2000000000000000000000000';

function collectionRow(opts: {
  collectionId: string;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
  series?: { id: string; title: string };
  endTime?: number | null;
}) {
  return {
    collectionId: opts.collectionId,
    creatorId: 'alice.near',
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
    metadata: opts.series ? JSON.stringify({ series: opts.series }) : null,
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

const NIGHT_ROADS = { id: 'night-roads', title: 'Night Roads' };

/** Browser GraphQL for series catalog settle (SSR still misses in this env). */
export async function stubSeriesCreatorCatalog(
  page: Page,
  opts?: {
    rows?: 'night-roads' | 'empty';
    catalogDelayMs?: number;
  }
): Promise<void> {
  const rows = opts?.rows ?? 'empty';
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (
      query.includes('ScarcesCollectionsCurrent') &&
      !query.includes('ScarcesCollectionsCurrentByIds')
    ) {
      if (catalogDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, catalogDelayMs));
      }
      const catalog =
        rows === 'night-roads'
          ? [
              collectionRow({
                collectionId: 'night-drive',
                title: 'Night Drive',
                kind: 'audio',
                extra: { audioFormat: 'album' },
                series: NIGHT_ROADS,
              }),
              collectionRow({
                collectionId: 'quiet-print',
                title: 'Quiet Print',
                kind: 'art',
                series: NIGHT_ROADS,
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
