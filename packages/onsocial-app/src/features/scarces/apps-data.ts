import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';

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
}

export interface AppView {
  appId: string;
  ownerId: string;
  title: string;
  description?: string;
  mediaUrl: string | null;
  bannerUrl: string | null;
  /** Primary-sale commission in basis points (0..=5000). */
  primarySaleBps: number;
  /** Commission as a percentage string, e.g. "2.5". */
  commissionPct: string;
  creatorAccess: CreatorAccess;
  moderators: string[];
  approvedCreators: string[];
  metadataRaw: string | null;
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
  return {
    appId,
    ownerId: record.owner_id,
    title: meta.name?.trim() || appId,
    ...(meta.description?.trim()
      ? { description: meta.description.trim() }
      : {}),
    mediaUrl: image ? resolveScarceMediaUrl(image) : null,
    bannerUrl: banner ? resolveScarceMediaUrl(banner) : null,
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

/** Map an indexer / thin record into AppView without a live roster. */
function toAppViewFromIndexer(row: {
  appId: string;
  ownerId: string;
  primarySaleBps?: number | null;
  creatorAccess?: string | null;
  metadata?: string | null;
}): AppView {
  const meta = parseMetadata(row.metadata);
  const bps = Math.max(
    0,
    Math.min(5000, Math.floor(row.primarySaleBps ?? 0))
  );
  const image = meta.image ?? meta.media ?? null;
  const banner = meta.banner ?? null;
  return {
    appId: row.appId,
    ownerId: row.ownerId,
    title: meta.name?.trim() || row.appId,
    ...(meta.description?.trim()
      ? { description: meta.description.trim() }
      : {}),
    mediaUrl: image ? resolveScarceMediaUrl(image) : null,
    bannerUrl: banner ? resolveScarceMediaUrl(banner) : null,
    primarySaleBps: bps,
    commissionPct: bpsToPct(bps),
    creatorAccess: parseCreatorAccess(row.creatorAccess),
    moderators: [],
    approvedCreators: [],
    metadataRaw: row.metadata ?? null,
  };
}

/** Directory listing — indexer only (no N× RPC). Detail pages use fetchApp. */
export async function fetchApps(
  opts: { fromIndex?: number; limit?: number } = {}
): Promise<AppView[]> {
  const limit = opts.limit ?? 60;
  const fromIndex = opts.fromIndex ?? 0;

  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const res = await client.query.graphql<{
      scarcesApps: Array<{
        appId: string;
        ownerId: string;
        primarySaleBps: number | null;
        creatorAccess: string | null;
        metadata: string | null;
      }>;
    }>({
      query: `query ScarcesApps($limit: Int!, $offset: Int!) {
        scarcesApps(
          limit: $limit
          offset: $offset
          orderBy: [{updatedBlockTimestamp: DESC}]
        ) {
          appId
          ownerId
          primarySaleBps
          creatorAccess
          metadata
        }
      }`,
      variables: { limit, offset: fromIndex },
    });
    const rows = res.data?.scarcesApps;
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map((row) =>
        toAppViewFromIndexer({
          appId: row.appId,
          ownerId: row.ownerId,
          primarySaleBps: row.primarySaleBps,
          creatorAccess: row.creatorAccess,
          metadata: row.metadata,
        })
      );
    }
  } catch {
    // Fall through to contract directory.
  }

  const ids = await fetchAllAppIds(opts);
  const views = await Promise.all(ids.map((id) => fetchApp(id)));
  return views.filter((view): view is AppView => view != null);
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
