// ---------------------------------------------------------------------------
// Page configuration queries — indexed `page/*` KV (e.g. `page/main`).
// Accessed as `os.query.pages.getConfig()`.
// ---------------------------------------------------------------------------

import { GraphQLValidationError } from './_shared.js';
import { resolvePageMoodId, type PageMoodId } from '../modules/pages/moods.js';
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

function moodIdFromPageConfig(config: PageConfig): PageMoodId {
  const raw =
    config.mood &&
    typeof config.mood === 'object' &&
    typeof config.mood.id === 'string'
      ? config.mood.id.trim()
      : '';
  return raw ? (resolvePageMoodId(raw) ?? 'protocol') : 'protocol';
}

interface PageMoodSourceRow {
  accountId: string;
  value: string;
  operation: string;
}

function moodIdsFromPageRows(
  rows: PageMoodSourceRow[]
): Partial<Record<string, PageMoodId>> {
  const moodIds: Partial<Record<string, PageMoodId>> = {};
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.accountId)) {
      continue;
    }
    seen.add(row.accountId);
    if (row.operation !== 'set') {
      continue;
    }

    moodIds[row.accountId] = moodIdFromPageConfig(
      parsePageConfigValue(row.value)
    );
  }

  return moodIds;
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

  /**
   * Batch-read active mood ids from indexed `page/main` rows.
   * Accounts without a page row or with a delete are omitted — callers
   * should default to `protocol`.
   */
  async getMoodIdsForAccounts(
    accountIds: string[],
    dataId = 'main'
  ): Promise<Partial<Record<string, PageMoodId>>> {
    const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return {};
    }

    try {
      return await this.fetchMoodIdsFromPagesCurrent(ids, dataId);
    } catch (error) {
      if (!isPagesCurrentGraphQLError(error)) {
        throw error;
      }
      return this.fetchMoodIdsFromDataUpdates(ids, dataId);
    }
  }

  private async fetchMoodIdsFromPagesCurrent(
    ids: string[],
    dataId: string
  ): Promise<Partial<Record<string, PageMoodId>>> {
    const res = await this._q.graphql<{ pagesCurrent: PageCurrentRow[] }>({
      query: `query PageMoodIds($ids: [String!]!, $dataId: String!) {
        pagesCurrent(
          where: {accountId: {_in: $ids}, dataId: {_eq: $dataId}}
        ) {
          accountId dataId value operation
        }
      }`,
      variables: { ids, dataId },
    });

    return moodIdsFromPageRows(res.data?.pagesCurrent ?? []);
  }

  private async fetchMoodIdsFromDataUpdates(
    ids: string[],
    dataId: string
  ): Promise<Partial<Record<string, PageMoodId>>> {
    const res = await this._q.graphql<{ dataUpdates: PageMoodSourceRow[] }>({
      query: `query PageMoodIdsFallback($ids: [String!]!, $dataId: String!) {
        dataUpdates(
          where: {
            _and: [
              {dataType: {_eq: "page"}},
              {dataId: {_eq: $dataId}},
              {accountId: {_in: $ids}}
            ]
          },
          orderBy: [{blockHeight: DESC}],
          limit: ${Math.min(Math.max(ids.length * 4, ids.length), 200)}
        ) {
          accountId value operation
        }
      }`,
      variables: { ids, dataId },
    });

    return moodIdsFromPageRows(res.data?.dataUpdates ?? []);
  }
}

function isPagesCurrentGraphQLError(error: unknown): boolean {
  if (!(error instanceof GraphQLValidationError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('pagescurrent') || message.includes('pages_current');
}

export { parsePageConfigValue };
