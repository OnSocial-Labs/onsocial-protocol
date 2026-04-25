// ---------------------------------------------------------------------------
// Raw indexed-data queries — the `data_updates` table backing `social.set()`.
// Accessed as `os.query.raw.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface DataRow {
  path: string;
  value: string;
  accountId: string;
  dataType?: string;
  dataId: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

export class RawQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Query indexed data by custom data type.
   *
   * Every `social.set()` call is indexed with a `data_type` derived from
   * the first path segment. This lets dApps query their own schemas.
   *
   * ```ts
   * await os.social.set('mygame/score-001', JSON.stringify({ points: 9000 }));
   * const rows = await os.query.raw.byType('mygame', { accountId: 'alice.near' });
   * ```
   */
  async byType(
    dataType: string,
    opts: { accountId?: string; limit?: number; offset?: number } = {}
  ): Promise<DataRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = [`{dataType: {_eq: $dataType}}`];
    if (opts.accountId) conditions.push(`{accountId: {_eq: $accountId}}`);
    const where =
      conditions.length === 1
        ? conditions[0]
        : `{_and: [${conditions.join(', ')}]}`;

    const res = await this._q.graphql<{ dataUpdates: DataRow[] }>({
      query: `query DataByType($dataType: String!${opts.accountId ? ', $accountId: String!' : ''}) {
        dataUpdates(where: ${where}, limit: ${limit}, offset: ${offset}, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataId blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        dataType,
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      },
    });
    return res.data?.dataUpdates ?? [];
  }

  /**
   * Look up a single data entry by its full path.
   *
   * ```ts
   * const row = await os.query.raw.byPath('alice.near/mygame/score-001');
   * ```
   */
  async byPath(path: string): Promise<DataRow | null> {
    const res = await this._q.graphql<{ dataUpdates: DataRow[] }>({
      query: `query DataByPath($path: String!) {
        dataUpdates(where: {path: {_eq: $path}}, limit: 1, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataType dataId blockHeight blockTimestamp operation
        }
      }`,
      variables: { path },
    });
    return res.data?.dataUpdates?.[0] ?? null;
  }

  /**
   * Filter custom indexed data on inner JSON fields using JSONB containment.
   *
   * Backed by the auto-derived `value_json` sidecar column and its GIN index,
   * so filters on nested keys are server-side and indexed — no per-type view
   * required. Rows whose `value` is not a JSON object/array are skipped.
   *
   * ```ts
   * await os.social.set('mygame/score-42', JSON.stringify({ points: 9000, level: 7 }));
   * const top = await os.query.raw.byJsonContains('mygame', { level: 7 }, {
   *   accountId: 'alice.near',
   *   limit: 25,
   * });
   * ```
   */
  async byJsonContains(
    dataType: string,
    contains: Record<string, unknown>,
    opts: { accountId?: string; limit?: number; offset?: number } = {}
  ): Promise<DataRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = [
      `{dataType: {_eq: $dataType}}`,
      `{valueJson: {_contains: $contains}}`,
    ];
    if (opts.accountId) conditions.push(`{accountId: {_eq: $accountId}}`);
    const where = `{_and: [${conditions.join(', ')}]}`;

    const res = await this._q.graphql<{ dataUpdates: DataRow[] }>({
      query: `query DataByJsonContains($dataType: String!, $contains: jsonb!${
        opts.accountId ? ', $accountId: String!' : ''
      }) {
        dataUpdates(where: ${where}, limit: ${limit}, offset: ${offset}, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataType dataId blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        dataType,
        contains,
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      },
    });
    return res.data?.dataUpdates ?? [];
  }
}
