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

const SAVE_ROW_SELECTION = `
  accountId contentPath value blockHeight blockTimestamp operation
`;

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
          ${SAVE_ROW_SELECTION}
        }
      }`,
      variables: { id: accountId, limit, offset },
    });
    return res.data?.savesCurrent ?? [];
  }

  /**
   * Active saves for an account restricted to the given content paths.
   * Prefer this for feed/thread membership over paging the full save list.
   *
   * ```ts
   * const rows = await os.query.saves.forPaths('alice.near', [
   *   'bob.near/post/1',
   *   'carol.near/groups/g/content/post/2',
   * ]);
   * ```
   */
  async forPaths(accountId: string, paths: string[]): Promise<SaveRow[]> {
    const unique = [
      ...new Set(paths.map((path) => path.trim()).filter(Boolean)),
    ];
    if (!unique.length) return [];

    const res = await this._q.graphql<{ savesCurrent: SaveRow[] }>({
      query: `query SavesForPaths($id: String!, $paths: [String!]!, $limit: Int!) {
        savesCurrent(
          where: {
            accountId: {_eq: $id},
            operation: {_eq: "set"},
            contentPath: {_in: $paths}
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${SAVE_ROW_SELECTION}
        }
      }`,
      variables: {
        id: accountId,
        paths: unique,
        limit: unique.length,
      },
    });
    return res.data?.savesCurrent ?? [];
  }
}
