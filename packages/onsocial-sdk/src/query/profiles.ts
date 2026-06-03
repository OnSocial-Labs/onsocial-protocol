// ---------------------------------------------------------------------------
// Profile queries.
// Accessed as `os.query.profiles.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface ProfileSearchRow {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  firstProfileTimestamp: number | null;
  lastProfileBlock: number;
  lastProfileTimestamp: number;
  lastActivityBlock: number;
}

export interface ProfileSearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ProfileDiscoverStandingRow {
  accountId: string;
  targetAccount: string;
  since: number | null;
  blockTimestamp: number;
}

export interface ProfileDiscoverViewerContext {
  outgoing: ProfileDiscoverStandingRow[];
  incomingAccountIds: string[];
  endorsementIssuers: string[];
}

export interface ProfileDiscoverPageOptions {
  query?: string;
  limit?: number;
  offset?: number;
  /** When set, viewer graph context is batched for the returned profile page only. */
  viewerAccountId?: string;
}

export interface ProfileDiscoverPageResult {
  profiles: ProfileSearchRow[];
  viewer: ProfileDiscoverViewerContext | null;
}

function parseStandingSince(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { since?: unknown };
    return typeof parsed.since === 'number' ? parsed.since : null;
  } catch {
    return null;
  }
}

const PROFILE_SEARCH_FIELDS = `
  accountId name bio avatar banner
  standingCount standingWithCount mutualStandingCount
  endorsementsReceivedCount endorsementsGivenCount
  firstProfileTimestamp
  lastProfileBlock lastProfileTimestamp lastActivityBlock
`;

export class ProfilesQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Get a profile as a merged field→value map. Returns `null` if the
   * account has no profile entries indexed.
   *
   * ```ts
   * const profile = await os.query.profiles.get('alice.near');
   * ```
   */
  async get(accountId: string): Promise<Record<string, string> | null> {
    const res = await this._q.graphql<{
      profilesCurrent: Array<{
        accountId: string;
        field: string;
        value: string;
        blockHeight: number;
        blockTimestamp: number;
        operation: string;
      }>;
    }>({
      query: `query Profile($id: String!) {
        profilesCurrent(where: {accountId: {_eq: $id}}) {
          accountId field value blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId },
    });
    const rows = res.data?.profilesCurrent;
    if (!rows || rows.length === 0) return null;
    const out: Record<string, string> = {};
    for (const row of rows) out[row.field] = row.value;
    return out;
  }

  /**
   * Look up a single discoverable profile row by exact account id.
   * Returns `null` when the account is not in the profile search index.
   *
   * ```ts
   * const row = await os.query.profiles.lookup('alice.near');
   * ```
   */
  async lookup(accountId: string): Promise<ProfileSearchRow | null> {
    const res = await this._q.graphql<{ profileSearch: ProfileSearchRow[] }>({
      query: `query ProfileLookup($id: String!) {
        profileSearch(where: {accountId: {_eq: $id}}, limit: 1) {
          accountId name bio avatar banner
          standingCount standingWithCount mutualStandingCount
          endorsementsReceivedCount endorsementsGivenCount
          firstProfileTimestamp
          lastProfileBlock lastProfileTimestamp lastActivityBlock
        }
      }`,
      variables: { id: accountId },
    });
    return res.data?.profileSearch?.[0] ?? null;
  }

  /**
   * Batch profile search stats for graph list enrichment.
   */
  async statsForAccounts(
    accountIds: string[]
  ): Promise<ProfileSearchRow[]> {
    const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    const res = await this._q.graphql<{ profileSearch: ProfileSearchRow[] }>({
      query: `query ProfileStatsBatch($ids: [String!]!, $limit: Int!) {
        profileSearch(where: {accountId: {_in: $ids}}, limit: $limit) {
          ${PROFILE_SEARCH_FIELDS}
        }
      }`,
      variables: { ids, limit: ids.length },
    });
    return res.data?.profileSearch ?? [];
  }

  /**
   * Search discoverable profiles by account id, display name, or bio.
   * Empty query returns recently active profiles, ordered by standing signal.
   *
   * ```ts
   * const profiles = await os.query.profiles.search({ query: 'alice' });
   * ```
   */
  async search(opts: ProfileSearchOptions = {}): Promise<ProfileSearchRow[]> {
    const query = opts.query?.trim();
    const filter = query ? 'where: {searchText: {_ilike: $pattern}}, ' : '';
    const variableDecl = query ? ', $pattern: String!' : '';
    const res = await this._q.graphql<{ profileSearch: ProfileSearchRow[] }>({
      query: `query ProfileSearch($limit: Int!, $offset: Int!${variableDecl}) {
        profileSearch(
          ${filter}
          limit: $limit,
          offset: $offset,
          orderBy: [{standingCount: DESC}, {lastActivityBlock: DESC}]
        ) {
          ${PROFILE_SEARCH_FIELDS}
        }
      }`,
      variables: {
        limit: opts.limit ?? 20,
        offset: opts.offset ?? 0,
        ...(query ? { pattern: `%${query}%` } : {}),
      },
    });
    return res.data?.profileSearch ?? [];
  }

  /**
   * Discover page — searchable profiles plus optional viewer graph context.
   * Without `viewerAccountId`, delegates to {@link search} (one round-trip).
   * With a viewer, batches profile search + standings + endorsements in one query.
   *
   * ```ts
   * const page = await os.query.profiles.discoverPage({
   *   query: 'alice',
   *   limit: 24,
   *   viewerAccountId: 'bob.near',
   * });
   * ```
   */
  async discoverPage(
    opts: ProfileDiscoverPageOptions = {}
  ): Promise<ProfileDiscoverPageResult> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const viewerAccountId = opts.viewerAccountId?.trim();

    if (!viewerAccountId) {
      const profiles = await this.search({
        query: opts.query,
        limit,
        offset,
      });
      return { profiles, viewer: null };
    }

    const query = opts.query?.trim();
    const profiles = await this.search({ query, limit, offset });
    const targetIds = profiles.map((row) => row.accountId);

    if (targetIds.length === 0) {
      return { profiles, viewer: { outgoing: [], incomingAccountIds: [], endorsementIssuers: [] } };
    }

    const [outgoing, incomingAccountIds, endorsementIssuers] = await Promise.all([
      this._q.standings.outgoingTargetsAmong(viewerAccountId, targetIds),
      this._q.standings.incomingSourcesAmong(viewerAccountId, targetIds),
      this._q.endorsements.issuersAmong(viewerAccountId, targetIds),
    ]);

    return {
      profiles,
      viewer: {
        outgoing: outgoing.map((row) => ({
          accountId: row.accountId,
          targetAccount: row.targetAccount,
          since: row.since,
          blockTimestamp: row.blockTimestamp,
        })),
        incomingAccountIds,
        endorsementIssuers,
      },
    };
  }
}
