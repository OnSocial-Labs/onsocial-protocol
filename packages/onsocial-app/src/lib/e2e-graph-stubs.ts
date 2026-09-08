/**
 * Playwright GraphQL fixtures. Real production deploys never set
 * `E2E_GRAPH_STUBS`, so cookie-selected stubs stay inert there.
 * CI / local e2e set the flag at process start (not `NEXT_PUBLIC_`).
 *
 * Tests opt in with cookie `onsocial.e2e.graph`
 * (`catalog=night-roads`, `vault=default`, `hub=catalog`, `guild=empty`,
 * `market=shop`, or combined).
 * No cookie → live indexer / existing `page.route` only (SSR miss still works).
 */

export const E2E_GRAPH_COOKIE = 'onsocial.e2e.graph';
export const E2E_VAULT_OWNER = 'greenghost.onsocial.testnet';
export const E2E_HUB_ID = 'e2e-hub';
export const E2E_HUB_TITLE = 'Audit Hub';
export const E2E_HUB_OWNER = 'alice.near';
export const E2E_HUB_CREATOR_B = 'bob.near';
export const E2E_GUILD_ID = 'audit-guild';
export const E2E_GUILD_TITLE = 'Audit Guild';
/** Stored name embeds a raw id so the hero must clean it. */
export const E2E_GUILD_STORED_NAME = `${E2E_GUILD_TITLE} grp_md_perm_1779813274071_ojf237`;
export const E2E_GUILD_OWNER = 'alice.near';
export const E2E_MARKET_CREATOR = 'e2e.market.testnet';
export const E2E_MARKET_LIVE_ASK = 'e2e-live-first Live Ask';
export const E2E_MARKET_ENDED_LOT = 'e2e-live-first Ended Lot';

export type E2eGraphCatalog = 'night-roads' | 'empty';
export type E2eGraphVault = 'default' | 'many-creators' | 'empty';
export type E2eGraphHub = 'catalog' | 'empty' | 'held' | 'staff';
export type E2eGraphGuild = 'empty' | 'missing' | 'member' | 'banned' | 'owner';
export type E2eGraphMarket = 'shop' | 'shop-empty' | 'live-first';

export type E2eGraphCookieValue = {
  catalog?: E2eGraphCatalog;
  vault?: E2eGraphVault;
  hub?: E2eGraphHub;
  guild?: E2eGraphGuild;
  market?: E2eGraphMarket;
};

const TWO_NEAR_YOCTO = '2000000000000000000000000';
const ONE_NEAR_YOCTO = '1000000000000000000000000';
const SIX_TENTHS_NEAR_YOCTO = '600000000000000000000000';
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
  const guild = params.get('guild');
  if (
    guild === 'empty' ||
    guild === 'missing' ||
    guild === 'member' ||
    guild === 'banned' ||
    guild === 'owner'
  ) {
    parsed.guild = guild;
  }
  const market = params.get('market');
  if (
    market === 'shop' ||
    market === 'shop-empty' ||
    market === 'live-first'
  ) {
    parsed.market = market;
  }
  return parsed;
}

export function serializeE2eGraphCookie(opts: E2eGraphCookieValue): string {
  const params = new URLSearchParams();
  if (opts.catalog) params.set('catalog', opts.catalog);
  if (opts.vault) params.set('vault', opts.vault);
  if (opts.hub) params.set('hub', opts.hub);
  if (opts.guild) params.set('guild', opts.guild);
  if (opts.market) params.set('market', opts.market);
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

export function isScarcesEventsQuery(query: string): boolean {
  return query.includes('ScarcesEvents');
}

export function isAppRowQuery(query: string): boolean {
  return query.includes('ScarcesAppRow');
}

export function isAppStatsQuery(query: string): boolean {
  return query.includes('ScarcesAppStats');
}

export function isGroupsByIdsQuery(query: string): boolean {
  return query.includes('GroupsByIds');
}

export function isGroupFeedQuery(query: string): boolean {
  return (
    query.includes('GroupFeed') || query.includes('FilteredGroupFeed')
  );
}

export function isGroupMembershipForQuery(query: string): boolean {
  return query.includes('GroupMembershipFor');
}

export function isGroupBannedOfQuery(query: string): boolean {
  return query.includes('GroupBannedOf');
}

export function isGroupMembersOfQuery(query: string): boolean {
  return query.includes('GroupMembersOf');
}

export function isGroupMemberCountsQuery(query: string): boolean {
  return query.includes('GroupMemberCounts');
}

export function isGroupPostCountQuery(query: string): boolean {
  return query.includes('GroupPostCount');
}

export function isProfileBatchQuery(query: string): boolean {
  return (
    query.includes('ProfileStatsBatch') || query.includes('ProfileKinds')
  );
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

export function isMarketShopCatalogQuery(
  query: string,
  variables: Record<string, unknown> = {}
): boolean {
  return (
    isCreatorCatalogQuery(query) &&
    !isAppCatalogQuery(query, variables) &&
    variables.creatorId === E2E_MARKET_CREATOR
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

function e2eGuildOwnerId(guild: E2eGraphGuild): string {
  return guild === 'owner' ? E2E_VAULT_OWNER : E2E_GUILD_OWNER;
}

function e2eGuildMemberRow(opts: {
  memberId: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  canModerate?: boolean;
}) {
  return {
    groupId: E2E_GUILD_ID,
    memberId: opts.memberId,
    role: opts.isOwner ? 'owner' : opts.isAdmin ? 'admin' : 'member',
    level: opts.isOwner ? 3 : opts.isAdmin ? 2 : 1,
    isOwner: Boolean(opts.isOwner),
    isAdmin: Boolean(opts.isAdmin),
    canModerate: Boolean(opts.canModerate || opts.isOwner || opts.isAdmin),
    blockHeight: 1,
    blockTimestamp: 1,
  };
}

export function e2eGuildCurrentRows(guild: E2eGraphGuild) {
  if (guild === 'missing') return [];
  return [
    {
      groupId: E2E_GUILD_ID,
      ownerId: e2eGuildOwnerId(guild),
      groupName: E2E_GUILD_STORED_NAME,
      groupDescription: 'A stub guild for e2e.',
      groupBannerCid: null,
      groupBadgeCid: null,
      isPublic: true,
      isMemberDriven: false,
      groupTopics: ['builders'],
      blockHeight: 1,
      blockTimestamp: 1,
    },
  ];
}

export function e2eGuildMemberRows(guild: E2eGraphGuild) {
  if (guild === 'missing') return [];
  const ownerId = e2eGuildOwnerId(guild);
  return [
    e2eGuildMemberRow({
      memberId: ownerId,
      isOwner: true,
      isAdmin: true,
      canModerate: true,
    }),
    ...(guild === 'member'
      ? [e2eGuildMemberRow({ memberId: E2E_VAULT_OWNER })]
      : []),
  ];
}

export function e2eGuildMembershipRows(
  guild: E2eGraphGuild,
  viewerId?: string
) {
  if (guild === 'missing' || guild === 'banned') return [];
  const ownerId = e2eGuildOwnerId(guild);
  const memberId = viewerId?.trim() || '';
  if (memberId && memberId === ownerId) {
    return [
      e2eGuildMemberRow({
        memberId,
        isOwner: true,
        isAdmin: true,
        canModerate: true,
      }),
    ];
  }
  if (guild === 'member' && memberId === E2E_VAULT_OWNER) {
    return [e2eGuildMemberRow({ memberId })];
  }
  return [];
}

export function e2eGuildBannedRows(guild: E2eGraphGuild) {
  if (guild !== 'banned') return [];
  return [
    {
      groupId: E2E_GUILD_ID,
      memberId: E2E_VAULT_OWNER,
      blockHeight: 1,
      blockTimestamp: 1,
    },
  ];
}

export function e2eGuildMemberCountRows(guild: E2eGraphGuild) {
  if (guild === 'missing') return [];
  return [
    {
      groupId: E2E_GUILD_ID,
      memberCount: guild === 'member' ? 2 : 1,
    },
  ];
}

export function e2eMarketShopCatalogRows(market: E2eGraphMarket) {
  if (market !== 'shop') return [];
  return [
    collectionRow({
      collectionId: 'night-drive',
      creatorId: E2E_MARKET_CREATOR,
      title: 'Night Drive',
      kind: 'audio',
      extra: { audioFormat: 'album' },
    }),
    collectionRow({
      collectionId: 'quiet-print',
      creatorId: E2E_MARKET_CREATOR,
      title: 'Quiet Print',
      kind: 'art',
      endTime: FIXTURE_ENDED_AT,
    }),
  ];
}

export function e2eMarketListingRows(market: E2eGraphMarket) {
  if (market !== 'live-first') return [];
  const now = Date.now();
  return [
    {
      listingKey: 'auction:e2e-ended',
      kind: 'auction',
      listingId: null,
      tokenId: 'e2e-ended:1',
      sellerId: E2E_MARKET_CREATOR,
      creatorId: E2E_MARKET_CREATOR,
      appId: null,
      price: SIX_TENTHS_NEAR_YOCTO,
      priceNumeric: 0.6,
      reservePrice: SIX_TENTHS_NEAR_YOCTO,
      buyNowPrice: null,
      highestBid: SIX_TENTHS_NEAR_YOCTO,
      bidCount: 1,
      copies: 1,
      remaining: 1,
      mintedCount: 1,
      expiresAt: now - 3_600_000,
      title: E2E_MARKET_ENDED_LOT,
      media: null,
      sourcePostPath: null,
      cardBg: null,
      extraJson: null,
      mediumKind: 'art',
      audioFormat: null,
      facets: [],
      listedBlockHeight: 1,
      listedBlockTimestamp: now,
      updatedBlockHeight: 1,
      updatedBlockTimestamp: now,
    },
    {
      listingKey: 'native:e2e-live',
      kind: 'native',
      listingId: null,
      tokenId: 'e2e-live:1',
      sellerId: E2E_MARKET_CREATOR,
      creatorId: E2E_MARKET_CREATOR,
      appId: null,
      price: ONE_NEAR_YOCTO,
      priceNumeric: 1,
      reservePrice: null,
      buyNowPrice: null,
      highestBid: null,
      bidCount: 0,
      copies: 1,
      remaining: 1,
      mintedCount: 1,
      expiresAt: null,
      title: E2E_MARKET_LIVE_ASK,
      media: null,
      sourcePostPath: null,
      cardBg: null,
      extraJson: null,
      mediumKind: 'art',
      audioFormat: null,
      facets: [],
      listedBlockHeight: 1,
      listedBlockTimestamp: now - 86_400_000,
      updatedBlockHeight: 1,
      updatedBlockTimestamp: now - 86_400_000,
    },
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

  if (parsed.guild && isGroupsByIdsQuery(opts.query)) {
    return { data: { groupsCurrent: e2eGuildCurrentRows(parsed.guild) } };
  }
  if (parsed.guild && isGroupFeedQuery(opts.query)) {
    return { data: { postsCurrent: [] } };
  }
  if (parsed.guild && isGroupMembershipForQuery(opts.query)) {
    const viewerId =
      typeof variables.memberId === 'string' ? variables.memberId : '';
    return {
      data: {
        groupMembersCurrent: e2eGuildMembershipRows(parsed.guild, viewerId),
      },
    };
  }
  if (parsed.guild && isGroupBannedOfQuery(opts.query)) {
    return {
      data: { groupBlacklistCurrent: e2eGuildBannedRows(parsed.guild) },
    };
  }
  if (parsed.guild && isGroupMembersOfQuery(opts.query)) {
    return {
      data: { groupMembersCurrent: e2eGuildMemberRows(parsed.guild) },
    };
  }
  if (parsed.guild && isGroupMemberCountsQuery(opts.query)) {
    return {
      data: { groupMemberCounts: e2eGuildMemberCountRows(parsed.guild) },
    };
  }
  if (parsed.guild && isGroupPostCountQuery(opts.query)) {
    return {
      data: { postsCurrentAggregate: { aggregate: { count: 0 } } },
    };
  }
  if (parsed.guild && isProfileBatchQuery(opts.query)) {
    return { data: { profileSearch: [], profileKinds: [] } };
  }

  if (
    parsed.market &&
    (parsed.market === 'shop' || parsed.market === 'shop-empty') &&
    isMarketShopCatalogQuery(opts.query, variables)
  ) {
    return {
      data: { scarcesCollectionsCurrent: e2eMarketShopCatalogRows(parsed.market) },
    };
  }
  if (parsed.market && isActiveListingsQuery(opts.query)) {
    return {
      data: { scarcesActiveListings: e2eMarketListingRows(parsed.market) },
    };
  }
  if (parsed.market && isScarcesEventsQuery(opts.query)) {
    return { data: { scarcesEvents: [] } };
  }
  if (parsed.market && isProfileBatchQuery(opts.query)) {
    return { data: { profileSearch: [], profileKinds: [] } };
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
