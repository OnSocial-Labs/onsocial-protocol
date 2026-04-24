// ---------------------------------------------------------------------------
// Save (bookmark) queries.
// Accessed as `os.query.saves.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface SaveRow {
  accountId: string;
  contentPath: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

export class SavesQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Saves (bookmarks) for an account.
   *
   * ```ts
   * const saves = await os.query.saves.list('alice.near');
   * ```
   */
  async list(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<SaveRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{ savesCurrent: SaveRow[] }>({
      query: `query Saves($id: String!, $limit: Int!, $offset: Int!) {
        savesCurrent(
          where: {accountId: {_eq: $id}, operation: {_eq: "set"}},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          accountId contentPath value blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId, limit, offset },
    });
    return res.data?.savesCurrent ?? [];
  }
}
