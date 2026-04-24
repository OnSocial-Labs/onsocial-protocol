// ---------------------------------------------------------------------------
// Profile queries.
// Accessed as `os.query.profiles.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

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
}
