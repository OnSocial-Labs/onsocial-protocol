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
          accountId name bio avatar banner
          standingCount standingWithCount mutualStandingCount
          endorsementsReceivedCount endorsementsGivenCount
          firstProfileTimestamp
          lastProfileBlock lastProfileTimestamp lastActivityBlock
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
}
