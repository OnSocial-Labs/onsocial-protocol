// ---------------------------------------------------------------------------
// Raw indexed-data queries — the `data_updates` table backing `social.set()`.
// Accessed as `os.query.raw.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/** First path segment after the account when writes use `paths.app(appId, …)`. */
export const APP_DATA_TYPE = 'apps';

export interface DataRow {
  path: string;
  value: string;
  accountId: string;
  dataType?: string;
  dataId: string;
  /** Path after `apps/<appId>/`. Empty at the app root; omitted on non-apps rows. */
  appRelpath?: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

/** Escape `\`, `%`, and `_` so user input is literal in a SQL LIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Trim and strip leading/trailing slashes from an apps/ relative prefix. */
export function normalizeAppPrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, '');
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

  /**
   * Query writes under `apps/<appId>/…`.
   * Indexed as `data_type = apps` and `data_id = appId`.
   */
  async byAppId(
    appId: string,
    opts: { accountId?: string; limit?: number; offset?: number } = {}
  ): Promise<DataRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = [
      `{dataType: {_eq: $dataType}}`,
      `{dataId: {_eq: $appId}}`,
    ];
    if (opts.accountId) conditions.push(`{accountId: {_eq: $accountId}}`);
    const where = `{_and: [${conditions.join(', ')}]}`;

    const res = await this._q.graphql<{ dataUpdates: DataRow[] }>({
      query: `query DataByAppId($dataType: String!, $appId: String!${opts.accountId ? ', $accountId: String!' : ''}) {
        dataUpdates(where: ${where}, limit: ${limit}, offset: ${offset}, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataType dataId blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        dataType: APP_DATA_TYPE,
        appId,
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      },
    });
    return res.data?.dataUpdates ?? [];
  }

  /**
   * JSON-contains filter scoped to one app namespace (`apps/<appId>/…`).
   */
  async byAppJsonContains(
    appId: string,
    contains: Record<string, unknown>,
    opts: { accountId?: string; limit?: number; offset?: number } = {}
  ): Promise<DataRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = [
      `{dataType: {_eq: $dataType}}`,
      `{dataId: {_eq: $appId}}`,
      `{valueJson: {_contains: $contains}}`,
    ];
    if (opts.accountId) conditions.push(`{accountId: {_eq: $accountId}}`);
    const where = `{_and: [${conditions.join(', ')}]}`;

    const res = await this._q.graphql<{ dataUpdates: DataRow[] }>({
      query: `query DataByAppJsonContains($dataType: String!, $appId: String!, $contains: jsonb!${
        opts.accountId ? ', $accountId: String!' : ''
      }) {
        dataUpdates(where: ${where}, limit: ${limit}, offset: ${offset}, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataType dataId blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        dataType: APP_DATA_TYPE,
        appId,
        contains,
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      },
    });
    return res.data?.dataUpdates ?? [];
  }

  /**
   * List latest rows under `apps/<appId>/<prefix>/…` across accounts.
   *
   * Queries `appsCurrent` (latest row per full path, already scoped to
   * `data_type = apps`). Prefix matching is slash-bounded so `lot` does
   * not match `lottery`.
   *
   * ```ts
   * const folder = await os.query.raw.byAppPrefix('acme-track', 'lot');
   * const profiles = await os.query.raw.byAppPrefix('dating', 'profile', {
   *   accountId: 'alice.near',
   *   limit: 25,
   * });
   * ```
   *
   * An empty prefix lists every latest row for that appId (same scope as
   * {@link byAppId}, but latest-per-path).
   */
  async byAppPrefix(
    appId: string,
    prefix: string,
    opts: { accountId?: string; limit?: number; offset?: number } = {}
  ): Promise<DataRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const normalized = normalizeAppPrefix(prefix);
    const conditions = [`{dataId: {_eq: $appId}}`];
    if (normalized) {
      conditions.push(
        `{_or: [{appRelpath: {_eq: $prefix}}, {appRelpath: {_like: $prefixLike}}]}`
      );
    }
    if (opts.accountId) conditions.push(`{accountId: {_eq: $accountId}}`);
    const where =
      conditions.length === 1
        ? conditions[0]
        : `{_and: [${conditions.join(', ')}]}`;

    const res = await this._q.graphql<{ appsCurrent: DataRow[] }>({
      query: `query DataByAppPrefix($appId: String!${
        normalized ? ', $prefix: String!, $prefixLike: String!' : ''
      }${opts.accountId ? ', $accountId: String!' : ''}) {
        appsCurrent(where: ${where}, limit: ${limit}, offset: ${offset}, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataId appRelpath blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        appId,
        ...(normalized
          ? {
              prefix: normalized,
              prefixLike: `${escapeLike(normalized)}/%`,
            }
          : {}),
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      },
    });
    return (res.data?.appsCurrent ?? []).map((row) => ({
      ...row,
      dataType: row.dataType ?? APP_DATA_TYPE,
    }));
  }
}
