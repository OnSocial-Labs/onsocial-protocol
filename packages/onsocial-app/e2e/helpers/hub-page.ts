import type { Page } from '@playwright/test';

const TWO_NEAR_YOCTO = '2000000000000000000000000';

export const HUB_E2E_ID = 'e2e-hub';
export const HUB_E2E_TITLE = 'Audit Hub';
export const HUB_E2E_OWNER = 'alice.near';
export const HUB_E2E_PATH = `/apps/${encodeURIComponent(HUB_E2E_ID)}`;

function collectionRow(opts: {
  collectionId: string;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
  endTime?: number | null;
}) {
  return {
    collectionId: opts.collectionId,
    creatorId: HUB_E2E_OWNER,
    appId: HUB_E2E_ID,
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

const HUB_APP_ROW = {
  appId: HUB_E2E_ID,
  ownerId: HUB_E2E_OWNER,
  primarySaleBps: 250,
  creatorAccess: 'open',
  metadata: JSON.stringify({
    name: HUB_E2E_TITLE,
    description: 'A stub hub for e2e.',
  }),
  createdBlockTimestamp: 1,
  updatedBlockTimestamp: 1,
};

const HUB_STATS = {
  appId: HUB_E2E_ID,
  dropsTotal: 4,
  mintedTotal: 12,
  uniqueHolders: 6,
  salesCount: 3,
  salesVolume: '4000000000000000000000000',
  liveListings: 2,
  lastActivityTimestamp: Date.now() * 1_000_000,
};

const HELD_OWNER = 'greenghost.onsocial.testnet';

/** Browser GraphQL for hub catalog settle (SSR still misses in this env). */
export async function stubHubPage(
  page: Page,
  opts?: {
    rows?: 'catalog' | 'empty';
    catalogDelayMs?: number;
    /** Also stub owned tokens that match the hub catalog. */
    held?: boolean;
  }
): Promise<void> {
  const rows = opts?.rows ?? 'empty';
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  const held = opts?.held === true;
  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    if (held && query.includes('ScarcesOwnedBy')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesTokenOwners: [
              {
                tokenId: 'night-drive:3',
                ownerId: HELD_OWNER,
                burned: false,
                collectionId: 'night-drive',
                appId: HUB_E2E_ID,
                mintedBlockTimestamp: 1,
                updatedBlockTimestamp: 3,
              },
              {
                tokenId: 'dusk-run:1',
                ownerId: HELD_OWNER,
                burned: false,
                collectionId: 'dusk-run',
                appId: HUB_E2E_ID,
                mintedBlockTimestamp: 1,
                updatedBlockTimestamp: 4,
              },
            ],
          },
        }),
      });
      return;
    }

    if (held && query.includes('ScarcesCollectionsCurrentByIds')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            scarcesCollectionsCurrent: [
              collectionRow({
                collectionId: 'night-drive',
                title: 'Night Drive',
                kind: 'audio',
                extra: { audioFormat: 'album' },
              }),
              collectionRow({
                collectionId: 'dusk-run',
                title: 'Dusk Run',
                kind: 'audio',
                extra: { audioFormat: 'single' },
              }),
            ],
          },
        }),
      });
      return;
    }

    if (query.includes('ScarcesAppRow')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { scarcesApps: [HUB_APP_ROW] } }),
      });
      return;
    }

    if (query.includes('ScarcesAppStats')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { scarcesAppStats: [HUB_STATS] } }),
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
        rows === 'catalog'
          ? [
              collectionRow({
                collectionId: 'night-drive',
                title: 'Night Drive',
                kind: 'audio',
                extra: { audioFormat: 'album' },
              }),
              collectionRow({
                collectionId: 'quiet-print',
                title: 'Quiet Print',
                kind: 'art',
                endTime: Date.now() - 86_400_000,
              }),
              collectionRow({
                collectionId: 'dusk-run',
                title: 'Dusk Run',
                kind: 'audio',
                extra: { audioFormat: 'single' },
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
