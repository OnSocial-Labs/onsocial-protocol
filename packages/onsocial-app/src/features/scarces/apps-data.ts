import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import {
  APPS_PAGE_SIZE,
  isLikelyTestStore,
  sortApps,
  type AppsAccessFilter,
  type AppsDirectorySort,
} from '@/features/scarces/apps-directory';
import {
  parseHubCategory,
  parseHubTopics,
  type HubCategoryFilter,
} from '@/features/scarces/hub-categories';

/**
 * App (store) reads — a branded economic network on the shared scarces
 * contract. An app has an owner, a primary-sale commission, a creator-access
 * policy, and rosters of moderators / approved creators. Collections created
 * under an app snapshot its commission at creation.
 *
 * The live record is read from the contract so owner / commission / access are
 * always current; the indexer (`scarces_apps`, `scarces_app_creators`) backs
 * scalable directory + membership discovery.
 */

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

export type CreatorAccess = 'open' | 'approval' | 'invite_only';

/** Raw on-chain `AppPool` fields this app reads. */
interface AppPoolRecord {
  owner_id?: string;
  balance?: string | { '0'?: string } | null;
  used_bytes?: number;
  max_user_bytes?: number;
  default_royalty?: Record<string, number> | null;
  primary_sale_bps?: number;
  moderators?: string[];
  curated?: boolean;
  metadata?: string | null;
  creator_access?: string | null;
  approved_creators?: string[];
}

/** Parsed `metadata` JSON we understand for display. */
interface AppMetadata {
  name?: string;
  description?: string;
  image?: string;
  media?: string;
  base_uri?: string;
  banner?: string;
  category?: string;
  /** Freeform topics — primary is category; max 2. */
  topics?: string[];
}

export interface AppView {
  appId: string;
  ownerId: string;
  title: string;
  description?: string;
  mediaUrl: string | null;
  bannerUrl: string | null;
  /** Topics — primary (= category) first; max 2. */
  topics: string[];
  /** Primary topic for directory filter (topics[0]). */
  category: string | null;
  /** Primary-sale commission in basis points (0..=5000). */
  primarySaleBps: number;
  /** Commission as a percentage string, e.g. "2.5". */
  commissionPct: string;
  creatorAccess: CreatorAccess;
  moderators: string[];
  approvedCreators: string[];
  metadataRaw: string | null;
  /** Indexer `updated_block_timestamp` (ns → ms). */
  updatedAtMs?: number;
  /** Indexer `created_block_timestamp` (ns → ms). */
  createdAtMs?: number;
  /** Live Market listings under this store (directory enrichment). */
  liveListingCount?: number;
}

export interface FetchAppsOptions {
  fromIndex?: number;
  limit?: number;
  query?: string;
  access?: AppsAccessFilter;
  category?: HubCategoryFilter;
  sort?: AppsDirectorySort;
  /** Drop CI / SDK integration spam. Default true. */
  hideTest?: boolean;
}

export interface AppsDirectoryPage {
  apps: AppView[];
  hasMore: boolean;
  /** Next indexer offset (accounts for over-fetch when hiding tests). */
  nextOffset: number;
}

function nsToMs(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // NEAR timestamps are nanoseconds.
  return n > 1e15 ? Math.floor(n / 1e6) : Math.floor(n);
}

function asRecord(value: unknown): AppPoolRecord | null {
  return value && typeof value === 'object' ? (value as AppPoolRecord) : null;
}

function parseCreatorAccess(value: string | null | undefined): CreatorAccess {
  if (value === 'approval' || value === 'invite_only') return value;
  return 'open';
}

function parseMetadata(raw: string | null | undefined): AppMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as AppMetadata) : {};
  } catch {
    return {};
  }
}

function bpsToPct(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0$/, '');
}

function toAppView(
  appId: string,
  record: AppPoolRecord | null
): AppView | null {
  if (!record || !record.owner_id) return null;
  const meta = parseMetadata(record.metadata);
  const bps = Math.max(
    0,
    Math.min(5000, Math.floor(record.primary_sale_bps ?? 0))
  );
  const image = meta.image ?? meta.media ?? null;
  const banner = meta.banner ?? null;
  const topics = parseHubTopics(meta);
  return {
    appId,
    ownerId: record.owner_id,
    title: meta.name?.trim() || appId,
    ...(meta.description?.trim()
      ? { description: meta.description.trim() }
      : {}),
    mediaUrl: image ? resolveScarceMediaUrl(image) : null,
    bannerUrl: banner ? resolveScarceMediaUrl(banner) : null,
    topics,
    category: topics[0] ?? parseHubCategory(meta.category),
    primarySaleBps: bps,
    commissionPct: bpsToPct(bps),
    creatorAccess: parseCreatorAccess(record.creator_access),
    moderators: Array.isArray(record.moderators) ? record.moderators : [],
    approvedCreators: Array.isArray(record.approved_creators)
      ? record.approved_creators
      : [],
    metadataRaw: record.metadata ?? null,
  };
}

export function creatorAccessLabel(access: CreatorAccess): string {
  switch (access) {
    case 'open':
      return 'Open to all creators';
    case 'approval':
      return 'Approved creators only';
    case 'invite_only':
      return 'Only the owner and moderators can publish';
  }
}

export function creatorAccessShort(access: CreatorAccess): string {
  switch (access) {
    case 'open':
      return 'Open';
    case 'approval':
      return 'Approval';
    case 'invite_only':
      return 'Staff';
  }
}

/** One app record from the contract, or null when missing. */
export async function fetchApp(appId: string): Promise<AppView | null> {
  const id = appId.trim();
  if (!id) return null;
  try {
    const record = await viewNearContract<AppPoolRecord | null>(
      SCARCES_CONTRACT,
      'get_app_pool',
      { app_id: id }
    );
    return toAppView(id, asRecord(record));
  } catch {
    return null;
  }
}

/** All registered app ids (directory), newest-registered order not guaranteed. */
export async function fetchAllAppIds(
  opts: { fromIndex?: number; limit?: number } = {}
): Promise<string[]> {
  try {
    const ids = await viewNearContract<string[]>(
      SCARCES_CONTRACT,
      'get_all_app_ids',
      { from_index: opts.fromIndex ?? 0, limit: opts.limit ?? 60 }
    );
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

type IndexerAppRow = {
  appId: string;
  ownerId: string;
  primarySaleBps?: number | null;
  creatorAccess?: string | null;
  metadata?: string | null;
  createdBlockTimestamp?: number | null;
  updatedBlockTimestamp?: number | null;
};

/** Map an indexer / thin record into AppView without a live roster. */
function toAppViewFromIndexer(row: IndexerAppRow): AppView {
  const meta = parseMetadata(row.metadata);
  const bps = Math.max(
    0,
    Math.min(5000, Math.floor(row.primarySaleBps ?? 0))
  );
  const image = meta.image ?? meta.media ?? null;
  const banner = meta.banner ?? null;
  const updatedAtMs = nsToMs(row.updatedBlockTimestamp);
  const createdAtMs = nsToMs(row.createdBlockTimestamp);
  const topics = parseHubTopics(meta);
  return {
    appId: row.appId,
    ownerId: row.ownerId,
    title: meta.name?.trim() || row.appId,
    ...(meta.description?.trim()
      ? { description: meta.description.trim() }
      : {}),
    mediaUrl: image ? resolveScarceMediaUrl(image) : null,
    bannerUrl: banner ? resolveScarceMediaUrl(banner) : null,
    topics,
    category: topics[0] ?? parseHubCategory(meta.category),
    primarySaleBps: bps,
    commissionPct: bpsToPct(bps),
    creatorAccess: parseCreatorAccess(row.creatorAccess),
    moderators: [],
    approvedCreators: [],
    metadataRaw: row.metadata ?? null,
    ...(updatedAtMs != null ? { updatedAtMs } : {}),
    ...(createdAtMs != null ? { createdAtMs } : {}),
  };
}

function directoryOrderBy(sort: AppsDirectorySort): string {
  switch (sort) {
    case 'fee-asc':
      return '[{primarySaleBps: ASC}, {updatedBlockTimestamp: DESC}]';
    case 'fee-desc':
      return '[{primarySaleBps: DESC}, {updatedBlockTimestamp: DESC}]';
    case 'name':
      // Metadata JSON isn't a clean name column — sort client-side after fetch.
      return '[{updatedBlockTimestamp: DESC}]';
    case 'recent':
    default:
      return '[{updatedBlockTimestamp: DESC}]';
  }
}

function buildDirectoryWhere(opts: {
  query?: string;
  access?: AppsAccessFilter;
  hideTest?: boolean;
}): {
  params: string[];
  whereClause: string;
  variables: Record<string, unknown>;
} {
  const params: string[] = [];
  const clauses: string[] = [];
  const variables: Record<string, unknown> = {};

  if (opts.access && opts.access !== 'all') {
    params.push('$creatorAccess: String!');
    variables.creatorAccess = opts.access;
    clauses.push('{creatorAccess: {_eq: $creatorAccess}}');
  }

  const q = opts.query?.trim();
  if (q) {
    params.push('$queryLike: String!');
    variables.queryLike = `%${q}%`;
    clauses.push(
      '{_or: [{appId: {_ilike: $queryLike}}, {ownerId: {_ilike: $queryLike}}, {metadata: {_ilike: $queryLike}}]}'
    );
  }

  if (opts.hideTest !== false) {
    // Exclude known CI/SDK store spam at the indexer when possible.
    clauses.push('{_not: {metadata: {_ilike: "%integration-test%"}}}');
    clauses.push('{appId: {_nilike: "intapptest_%"}}');
    clauses.push('{appId: {_nilike: "smokeapptest_%"}}');
    clauses.push('{appId: {_nilike: "intapp%"}}');
  }

  const whereClause =
    clauses.length === 0
      ? ''
      : clauses.length === 1
        ? `where: ${clauses[0]},`
        : `where: {_and: [${clauses.join(', ')}]},`;

  return { params, whereClause, variables };
}

/**
 * Directory page — indexer `scarces_apps` with search / access / sort.
 * Detail pages still use `fetchApp` (live roster).
 */
export async function fetchAppsDirectory(
  opts: FetchAppsOptions = {}
): Promise<AppsDirectoryPage> {
  const limit = opts.limit ?? APPS_PAGE_SIZE;
  const fromIndex = opts.fromIndex ?? 0;
  const sort = opts.sort ?? 'recent';
  const hideTest = opts.hideTest !== false;
  const category = opts.category ?? 'all';
  // Over-fetch when hiding tests / filtering category so a page still fills.
  const needsOverfetch = hideTest || category !== 'all';
  const fetchLimit = needsOverfetch ? Math.min(limit * 3, 120) : limit + 1;

  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const built = buildDirectoryWhere({
      query: opts.query,
      access: opts.access,
      hideTest,
    });
    const params = ['$limit: Int!', '$offset: Int!', ...built.params];
    const res = await client.query.graphql<{
      scarcesApps: Array<{
        appId: string;
        ownerId: string;
        primarySaleBps: number | null;
        creatorAccess: string | null;
        metadata: string | null;
        createdBlockTimestamp: number | null;
        updatedBlockTimestamp: number | null;
      }>;
    }>({
      query: `query ScarcesAppsDirectory(${params.join(', ')}) {
        scarcesApps(
          ${built.whereClause}
          limit: $limit
          offset: $offset
          orderBy: ${directoryOrderBy(sort)}
        ) {
          appId
          ownerId
          primarySaleBps
          creatorAccess
          metadata
          createdBlockTimestamp
          updatedBlockTimestamp
        }
      }`,
      variables: {
        limit: fetchLimit,
        offset: fromIndex,
        ...built.variables,
      },
    });
    const rows = res.data?.scarcesApps;
    if (Array.isArray(rows)) {
      let apps = rows.map((row) => toAppViewFromIndexer(row));
      if (hideTest) {
        apps = apps.filter((app) => !isLikelyTestStore(app));
      }
      if (category !== 'all') {
        apps = apps.filter((app) => app.category === category);
      }
      if (sort === 'name' || sort === 'recent') {
        apps = sortApps(apps, sort);
      }
      const page = apps.slice(0, limit);
      const hasMore = rows.length >= fetchLimit || apps.length > limit;
      return {
        apps: page,
        hasMore,
        nextOffset: fromIndex + rows.length,
      };
    }
  } catch {
    // Fall through to contract directory.
  }

  const ids = await fetchAllAppIds({
    fromIndex,
    limit: fetchLimit,
  });
  const views = (
    await Promise.all(ids.map((id) => fetchApp(id)))
  ).filter((view): view is AppView => view != null);
  let apps = views;
  if (hideTest) apps = apps.filter((app) => !isLikelyTestStore(app));
  if (opts.access && opts.access !== 'all') {
    apps = apps.filter((app) => app.creatorAccess === opts.access);
  }
  if (category !== 'all') {
    apps = apps.filter((app) => app.category === category);
  }
  const q = opts.query?.trim().toLowerCase();
  if (q) {
    apps = apps.filter(
      (app) =>
        app.appId.toLowerCase().includes(q) ||
        app.ownerId.toLowerCase().includes(q) ||
        app.title.toLowerCase().includes(q) ||
        (app.description ?? '').toLowerCase().includes(q)
    );
  }
  apps = sortApps(apps, sort);
  return {
    apps: apps.slice(0, limit),
    hasMore: ids.length >= fetchLimit || apps.length > limit,
    nextOffset: fromIndex + ids.length,
  };
}

/** Directory listing — indexer only (no N× RPC). Detail pages use fetchApp. */
export async function fetchApps(
  opts: FetchAppsOptions = {}
): Promise<AppView[]> {
  const page = await fetchAppsDirectory(opts);
  return page.apps;
}

/**
 * Live Market listing counts keyed by store `appId`.
 * One indexer scan — used to annotate the directory, not for ACL.
 */
export async function fetchStoreLiveListingCounts(
  opts: { limit?: number } = {}
): Promise<Map<string, number>> {
  const limit = opts.limit ?? 500;
  const counts = new Map<string, number>();
  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const res = await client.query.graphql<{
      scarcesActiveListings: Array<{ appId: string | null }>;
    }>({
      query: `query StoreLiveListingCounts($limit: Int!) {
        scarcesActiveListings(
          where: {appId: {_isNull: false}}
          limit: $limit
        ) {
          appId
        }
      }`,
      variables: { limit },
    });
    for (const row of res.data?.scarcesActiveListings ?? []) {
      const id = row.appId?.trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  } catch {
    // Directory still works without listing annotations.
  }
  return counts;
}

export function mergeLiveListingCounts(
  apps: AppView[],
  counts: Map<string, number>
): AppView[] {
  if (counts.size === 0) return apps;
  return apps.map((app) => {
    const n = counts.get(app.appId);
    return n && n > 0 ? { ...app, liveListingCount: n } : app;
  });
}

/**
 * Stores the viewer can publish into (owned, moderating, or approved).
 * Indexer-only — used by List-to-store chips, not for ACL enforcement.
 */
export async function fetchPublishableApps(
  accountId: string,
  opts: { limit?: number } = {}
): Promise<AppView[]> {
  const account = accountId.trim();
  if (!account) return [];
  const limit = opts.limit ?? 40;

  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const res = await client.query.graphql<{
      owned: Array<{
        appId: string;
        ownerId: string;
        primarySaleBps: number | null;
        creatorAccess: string | null;
        metadata: string | null;
      }>;
      memberships: Array<{ appId: string }>;
    }>({
      query: `query PublishableApps($accountId: String!, $limit: Int!) {
        owned: scarcesApps(
          where: {ownerId: {_eq: $accountId}}
          limit: $limit
          orderBy: [{updatedBlockTimestamp: DESC}]
        ) {
          appId
          ownerId
          primarySaleBps
          creatorAccess
          metadata
        }
        memberships: scarcesAppCreators(
          where: {accountId: {_eq: $accountId}}
          limit: $limit
        ) {
          appId
        }
      }`,
      variables: { accountId: account, limit },
    });

    const byId = new Map<string, AppView>();
    for (const row of res.data?.owned ?? []) {
      byId.set(
        row.appId,
        toAppViewFromIndexer({
          appId: row.appId,
          ownerId: row.ownerId,
          primarySaleBps: row.primarySaleBps,
          creatorAccess: row.creatorAccess,
          metadata: row.metadata,
        })
      );
    }

    const memberIds = [
      ...new Set(
        (res.data?.memberships ?? [])
          .map((row) => row.appId?.trim())
          .filter((id): id is string => Boolean(id) && !byId.has(id))
      ),
    ];
    if (memberIds.length > 0) {
      const memberRes = await client.query.graphql<{
        scarcesApps: Array<{
          appId: string;
          ownerId: string;
          primarySaleBps: number | null;
          creatorAccess: string | null;
          metadata: string | null;
        }>;
      }>({
        query: `query MemberApps($ids: [String!]!) {
          scarcesApps(where: {appId: {_in: $ids}}, limit: 40) {
            appId
            ownerId
            primarySaleBps
            creatorAccess
            metadata
          }
        }`,
        variables: { ids: memberIds },
      });
      for (const row of memberRes.data?.scarcesApps ?? []) {
        byId.set(
          row.appId,
          toAppViewFromIndexer({
            appId: row.appId,
            ownerId: row.ownerId,
            primarySaleBps: row.primarySaleBps,
            creatorAccess: row.creatorAccess,
            metadata: row.metadata,
          })
        );
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    );
  } catch {
    return [];
  }
}

/** True when `accountId` may create collections under the app right now. */
export function canCreateInApp(
  app: AppView,
  accountId: string | null
): boolean {
  if (!accountId) return false;
  const id = accountId.toLowerCase();
  const matches = (list: string[]) => list.some((x) => x.toLowerCase() === id);
  if (app.ownerId.toLowerCase() === id) return true;
  if (matches(app.moderators)) return true;
  switch (app.creatorAccess) {
    case 'open':
      return true;
    case 'approval':
      return matches(app.approvedCreators);
    case 'invite_only':
      return false;
  }
}

/** Whether the viewer owns the app (config / roster authority). */
export function isAppOwner(app: AppView, accountId: string | null): boolean {
  return (
    !!accountId && app.ownerId.toLowerCase() === accountId.trim().toLowerCase()
  );
}

/** Whether the viewer is a store moderator (not the owner). */
export function isAppModerator(
  app: AppView,
  accountId: string | null
): boolean {
  if (!accountId) return false;
  const id = accountId.trim().toLowerCase();
  return app.moderators.some((mod) => mod.toLowerCase() === id);
}

/** Owner or moderator — can approve creators and ban drops. */
export function isAppAuthority(
  app: AppView,
  accountId: string | null
): boolean {
  return isAppOwner(app, accountId) || isAppModerator(app, accountId);
}
