/**
 * Playwright GraphQL fixtures. Real production deploys never set
 * `E2E_GRAPH_STUBS`, so cookie-selected stubs stay inert there.
 * CI / local e2e set the flag at process start (not `NEXT_PUBLIC_`).
 *
 * Tests opt in with cookie `onsocial.e2e.graph`
 * (`catalog=night-roads`, `vault=default`, or both).
 * No cookie → live indexer / existing `page.route` only (SSR miss still works).
 */

export const E2E_GRAPH_COOKIE = 'onsocial.e2e.graph';
export const E2E_VAULT_OWNER = 'greenghost.onsocial.testnet';

export type E2eGraphCatalog = 'night-roads' | 'empty';
export type E2eGraphVault = 'default' | 'many-creators' | 'empty';

export type E2eGraphCookieValue = {
  catalog?: E2eGraphCatalog;
  vault?: E2eGraphVault;
};

const TWO_NEAR_YOCTO = '2000000000000000000000000';
const NIGHT_ROADS = { id: 'night-roads', title: 'Night Roads' };
const FIXTURE_CREATED_AT = 1_700_000_000_000;
const FIXTURE_ENDED_AT = 1_699_913_600_000;
const MANY_CREATORS = [
  'alice.near',
  'bob.near',
  'cara.near',
  'drew.near',
  'erin.near',
  'finn.near',
] as const;

export function e2eGraphStubsAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || process.env.E2E_GRAPH_STUBS === '1'
  );
}

export function parseE2eGraphCookie(
  value: string | null | undefined
): E2eGraphCookieValue {
  if (!value?.trim()) return {};
  const params = new URLSearchParams(value.replace(/;/g, '&'));
  const parsed: E2eGraphCookieValue = {};
  const catalog = params.get('catalog');
  if (catalog === 'night-roads' || catalog === 'empty') {
    parsed.catalog = catalog;
  }
  const vault = params.get('vault');
  if (vault === 'default' || vault === 'many-creators' || vault === 'empty') {
    parsed.vault = vault;
  }
  return parsed;
}

export function serializeE2eGraphCookie(opts: E2eGraphCookieValue): string {
  const params = new URLSearchParams();
  if (opts.catalog) params.set('catalog', opts.catalog);
  if (opts.vault) params.set('vault', opts.vault);
  return params.toString();
}

export function isCreatorCatalogQuery(query: string): boolean {
  return (
    query.includes('ScarcesCollectionsCurrent') &&
    !query.includes('ScarcesCollectionsCurrentByIds')
  );
}

export function isCollectionsByIdsQuery(query: string): boolean {
  return query.includes('ScarcesCollectionsCurrentByIds');
}

export function isOwnedByQuery(query: string): boolean {
  return query.includes('ScarcesOwnedBy');
}

export function isActiveListingsQuery(query: string): boolean {
  return query.includes('ScarcesActiveListings');
}

export function extractGraphQuery(body: unknown): string {
  if (typeof body !== 'string' || !body.trim()) return '';
  try {
    return String((JSON.parse(body) as { query?: string }).query ?? '');
  } catch {
    return body;
  }
}

export function isGraphQueryRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): boolean {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url.includes('/graph/query')) return false;
  const method = (
    init?.method ??
    (typeof input !== 'string' && !(input instanceof URL)
      ? input.method
      : 'POST')
  ).toUpperCase();
  return method === 'POST';
}

function collectionRow(opts: {
  collectionId: string;
  creatorId?: string;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
  series?: { id: string; title: string };
  endTime?: number | null;
}) {
  return {
    collectionId: opts.collectionId,
    creatorId: opts.creatorId ?? 'alice.near',
    appId: null,
    price: TWO_NEAR_YOCTO,
    allowlistPrice: null,
    totalSupply: 10,
    mintedCount: 2,
    remaining: 8,
    startTime: null,
    endTime: opts.endTime ?? null,
    createdAt: FIXTURE_CREATED_AT,
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

function ownedRow(opts: {
  tokenId: string;
  collectionId: string;
  updatedBlockTimestamp: number;
}) {
  return {
    tokenId: opts.tokenId,
    ownerId: E2E_VAULT_OWNER,
    burned: false,
    collectionId: opts.collectionId,
    appId: null,
    mintedBlockTimestamp: 1,
    updatedBlockTimestamp: opts.updatedBlockTimestamp,
  };
}

/** Creator catalog rows for `ScarcesCollectionsCurrent` (not ByIds). */
export function e2eSeriesCatalogRows(
  catalog: E2eGraphCatalog
): ReturnType<typeof collectionRow>[] {
  if (catalog === 'empty') return [];
  return [
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
      endTime: FIXTURE_ENDED_AT,
    }),
  ];
}

export function e2eVaultOwnedRows(vault: E2eGraphVault) {
  if (vault === 'empty') return [];
  if (vault === 'many-creators') {
    return MANY_CREATORS.map((creatorId, index) =>
      ownedRow({
        tokenId: `drop-${index}:1`,
        collectionId: `drop-${index}`,
        updatedBlockTimestamp: index + 1,
      })
    );
  }
  return [
    ownedRow({
      tokenId: 'night-drive:3',
      collectionId: 'night-drive',
      updatedBlockTimestamp: 3,
    }),
    ownedRow({
      tokenId: 'night-drive:1',
      collectionId: 'night-drive',
      updatedBlockTimestamp: 2,
    }),
    ownedRow({
      tokenId: 'chapter-one:4',
      collectionId: 'chapter-one',
      updatedBlockTimestamp: 1,
    }),
    ownedRow({
      tokenId: 'dusk-run:1',
      collectionId: 'dusk-run',
      updatedBlockTimestamp: 4,
    }),
    ownedRow({
      tokenId: 'gate-pass:2',
      collectionId: 'gate-pass',
      updatedBlockTimestamp: 5,
    }),
  ];
}

export function e2eVaultCollectionRows(vault: E2eGraphVault) {
  if (vault === 'empty') return [];
  if (vault === 'many-creators') {
    return MANY_CREATORS.map((creatorId, index) =>
      collectionRow({
        collectionId: `drop-${index}`,
        creatorId,
        title: `Drop ${index + 1}`,
        kind: 'audio',
        extra: { audioFormat: 'single' },
      })
    );
  }
  return [
    collectionRow({
      collectionId: 'night-drive',
      title: 'Night Drive',
      kind: 'audio',
      extra: { audioFormat: 'album' },
      series: NIGHT_ROADS,
    }),
    collectionRow({
      collectionId: 'dusk-run',
      title: 'Dusk Run',
      kind: 'audio',
      extra: { audioFormat: 'single' },
      series: NIGHT_ROADS,
    }),
    collectionRow({
      collectionId: 'chapter-one',
      title: 'Chapter One',
      kind: 'writing',
    }),
    collectionRow({
      collectionId: 'gate-pass',
      creatorId: 'bob.near',
      title: 'Gate Pass',
      kind: 'ticket',
    }),
  ];
}

export function e2eVaultListingRows(vault: E2eGraphVault) {
  if (vault !== 'default') return [];
  return [
    {
      listingKey: 'native:night-drive:3',
      kind: 'native',
      listingId: null,
      tokenId: 'night-drive:3',
      sellerId: E2E_VAULT_OWNER,
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
  ];
}

export function resolveE2eGraphStub(opts: {
  query: string;
  cookieValue?: string | null;
}): { data: Record<string, unknown> } | null {
  const parsed = parseE2eGraphCookie(opts.cookieValue);
  if (parsed.vault && isOwnedByQuery(opts.query)) {
    return { data: { scarcesTokenOwners: e2eVaultOwnedRows(parsed.vault) } };
  }
  if (parsed.vault && isCollectionsByIdsQuery(opts.query)) {
    return {
      data: { scarcesCollectionsCurrent: e2eVaultCollectionRows(parsed.vault) },
    };
  }
  if (parsed.vault && isActiveListingsQuery(opts.query)) {
    return {
      data: { scarcesActiveListings: e2eVaultListingRows(parsed.vault) },
    };
  }
  if (parsed.catalog && isCreatorCatalogQuery(opts.query)) {
    return {
      data: { scarcesCollectionsCurrent: e2eSeriesCatalogRows(parsed.catalog) },
    };
  }
  return null;
}
