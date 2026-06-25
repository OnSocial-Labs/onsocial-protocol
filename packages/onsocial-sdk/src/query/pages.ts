// ---------------------------------------------------------------------------
// Page configuration queries — indexed `page/*` KV (e.g. `page/main`).
// Accessed as `os.query.pages.getConfig()`.
// ---------------------------------------------------------------------------

import type { PageConfig } from '../types.js';
import type { QueryModule } from './index.js';

export interface PageCurrentRow {
  accountId: string;
  dataId: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

function parsePageConfigValue(value: unknown): PageConfig {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as PageConfig;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as PageConfig;
  }
  return {};
}

export class PagesQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Read `page/main` from the indexer. Returns `null` when the account has no
   * indexed page row or the latest operation is a delete.
   *
   * ```ts
   * const config = await os.query.pages.getConfig('alice.near');
   * ```
   */
  async getConfig(
    accountId: string,
    dataId = 'main'
  ): Promise<PageConfig | null> {
    const res = await this._q.graphql<{ pagesCurrent: PageCurrentRow[] }>({
      query: `query PageConfig($accountId: String!, $dataId: String!) {
        pagesCurrent(
          where: {accountId: {_eq: $accountId}, dataId: {_eq: $dataId}}
          limit: 1
        ) {
          accountId dataId value blockHeight blockTimestamp operation
        }
      }`,
      variables: { accountId, dataId },
    });

    const row = res.data?.pagesCurrent?.[0];
    if (!row || row.operation !== 'set') {
      return null;
    }

    return parsePageConfigValue(row.value);
  }
}

export { parsePageConfigValue };
