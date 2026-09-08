/**
 * Playwright GraphQL fixtures. Real production deploys never set
 * `E2E_GRAPH_STUBS`, so cookie-selected stubs stay inert there.
 * CI / local e2e set the flag at process start (not `NEXT_PUBLIC_`).
 *
 * Tests opt in with cookie `onsocial.e2e.graph`
 * (`catalog=night-roads`, `vault=default`, `hub=catalog`, or combined).
 * No cookie → live indexer / existing `page.route` only (SSR miss still works).
 */

export const E2E_GRAPH_COOKIE = 'onsocial.e2e.graph';
export const E2E_VAULT_OWNER = 'greenghost.onsocial.testnet';
export const E2E_HUB_ID = 'e2e-hub';
export const E2E_HUB_TITLE = 'Audit Hub';
export const E2E_HUB_OWNER = 'alice.near';
export const E2E_HUB_CREATOR_B = 'bob.near';

export type E2eGraphCatalog = 'night-roads' | 'empty';
export type E2eGraphVault = 'default' | 'many-creators' | 'empty';
export type E2eGraphHub = 'catalog' | 'empty' | 'held' | 'staff';

export type E2eGraphCookieValue = {
  catalog?: E2eGraphCatalog;
  vault?: E2eGraphVault;
  hub?: E2eGraphHub;
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
  const hub = params.get('hub');
  if (
    hub === 'catalog' ||
    hub === 'empty' ||
    hub === 'held' ||
    hub === 'staff'
  ) {
    parsed.hub = hub;
  }
  return parsed;
}

export function serializeE2eGraphCookie(opts: E2eGraphCookieValue): string {
  const params = new URLSearchParams();
  if (opts.catalog) params.set('catalog', opts.catalog);
  if (opts.vault) params.set('vault', opts.vault);
  if (opts.hub) params.set('hub', opts.hub);
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

export function isAppRowQuery(query: string): boolean {
  return query.includes('ScarcesAppRow');
}

export function isAppStatsQuery(query: string): boolean {
  return query.includes('ScarcesAppStats');
}

export function extractGraphRequest(body: unknown): {
  query: string;
  variables: Record<string, unknown>;
} {
  if (typeof body !== 'string' || !body.trim()) {
    return { query: '', variables: {} };
  }
  try {
    const parsed = JSON.parse(body) as {
      query?: string;
      variables?: unknown;
    };
    const variables =
      parsed.variables &&
      typeof parsed.variables === 'object' &&
      !Array.isArray(parsed.variables)
        ? (parsed.variables as Record<string, unknown>)
        : {};
    return { query: String(parsed.query ?? ''), variables };
  } catch {
    return { query: body, variables: {} };
  }
}

export function extractGraphQuery(body: unknown): string {
  return extractGraphRequest(body).query;
}

export function isAppCatalogQuery(
  query: string,
  variables: Record<string, unknown> = {}
): boolean {
  return (
    isCreatorCatalogQuery(query) &&
    (typeof variables.appId === 'string' || Array.isArray(variables.appIds))
  );
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
  appId?: string | null;
  title: string;
  kind: string;
  extra?: Record<string, unknown>;
  series?: { id: string; title: string };
  endTime?: number | null;
}) {
  return {
    collectionId: opts.collectionId,
    creatorId: opts.creatorId ?? 'alice.near',
    appId: opts.appId ?? null,
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
  appId?: string | null;
}) {
  return {
    tokenId: opts.tokenId,
    ownerId: E2E_VAULT_OWNER,
    burned: false,
    collectionId: opts.collectionId,
    appId: opts.appId ?? null,
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

export function e2eHubAppRow(hub: E2eGraphHub) {
  return {
    appId: E2E_HUB_ID,
    ownerId: hub === 'staff' ? E2E_VAULT_OWNER : E2E_HUB_OWNER,
    primarySaleBps: 250,
    creatorAccess: 'open',
    metadata: JSON.stringify({
      name: E2E_HUB_TITLE,
      description: 'A stub hub for e2e.',
    }),
    createdBlockTimestamp: 1,
    updatedBlockTimestamp: 1,
  };
}

export function e2eHubStatsRow() {
  return {
    appId: E2E_HUB_ID,
    dropsTotal: 4,
    mintedTotal: 12,
    uniqueHolders: 6,
    salesCount: 3,
    salesVolume: '4000000000000000000000000',
    liveListings: 2,
    lastActivityTimestamp: FIXTURE_CREATED_AT * 1_000_000,
  };
}

export function e2eHubCatalogRows(hub: E2eGraphHub) {
  if (hub === 'empty') return [];
  return [
    collectionRow({
      collectionId: 'night-drive',
      appId: E2E_HUB_ID,
      title: 'Night Drive',
      kind: 'audio',
      extra: { audioFormat: 'album' },
    }),
    collectionRow({
      collectionId: 'quiet-print',
      appId: E2E_HUB_ID,
      title: 'Quiet Print',
      kind: 'art',
      creatorId: E2E_HUB_CREATOR_B,
      endTime: FIXTURE_ENDED_AT,
    }),
    collectionRow({
      collectionId: 'dusk-run',
      appId: E2E_HUB_ID,
      title: 'Dusk Run',
      kind: 'audio',
      extra: { audioFormat: 'single' },
    }),
  ];
}

export function e2eHubOwnedRows(hub: E2eGraphHub) {
  if (hub !== 'held') return [];
  return [
    ownedRow({
      tokenId: 'night-drive:3',
      collectionId: 'night-drive',
      updatedBlockTimestamp: 3,
      appId: E2E_HUB_ID,
    }),
    ownedRow({
      tokenId: 'dusk-run:1',
      collectionId: 'dusk-run',
      updatedBlockTimestamp: 4,
      appId: E2E_HUB_ID,
    }),
  ];
}

export function e2eHubHeldCollectionRows() {
  return [
    collectionRow({
      collectionId: 'night-drive',
      appId: E2E_HUB_ID,
      title: 'Night Drive',
      kind: 'audio',
      extra: { audioFormat: 'album' },
    }),
    collectionRow({
      collectionId: 'dusk-run',
      appId: E2E_HUB_ID,
      title: 'Dusk Run',
      kind: 'audio',
      extra: { audioFormat: 'single' },
    }),
  ];
}

export function resolveE2eGraphStub(opts: {
  query: string;
  variables?: Record<string, unknown>;
  cookieValue?: string | null;
}): { data: Record<string, unknown> } | null {
  const parsed = parseE2eGraphCookie(opts.cookieValue);
  const variables = opts.variables ?? {};

  if (parsed.hub && isAppRowQuery(opts.query)) {
    return { data: { scarcesApps: [e2eHubAppRow(parsed.hub)] } };
  }
  if (parsed.hub && isAppStatsQuery(opts.query)) {
    return { data: { scarcesAppStats: [e2eHubStatsRow()] } };
  }
  if (parsed.hub && isOwnedByQuery(opts.query)) {
    return { data: { scarcesTokenOwners: e2eHubOwnedRows(parsed.hub) } };
  }
  if (parsed.hub === 'held' && isCollectionsByIdsQuery(opts.query)) {
    return {
      data: { scarcesCollectionsCurrent: e2eHubHeldCollectionRows() },
    };
  }
  if (parsed.hub && isAppCatalogQuery(opts.query, variables)) {
    return {
      data: { scarcesCollectionsCurrent: e2eHubCatalogRows(parsed.hub) },
    };
  }

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
  if (
    parsed.catalog &&
    isCreatorCatalogQuery(opts.query) &&
    !isAppCatalogQuery(opts.query, variables)
  ) {
    return {
      data: { scarcesCollectionsCurrent: e2eSeriesCatalogRows(parsed.catalog) },
    };
  }
  return null;
}
