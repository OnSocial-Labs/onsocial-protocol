/**
 * Usage metering service — records every authenticated API request.
 *
 * Follows the same dual-store pattern as api-keys:
 *   - Production (HASURA_ADMIN_SECRET set): writes to PostgreSQL via Hasura
 *   - Dev/testnet: accumulates in-memory (lost on restart, good enough for dev)
 *
 * All writes are fire-and-forget — metering never blocks or slows the response.
 */

import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

// --- Types ---

export interface UsageRecord {
  keyPrefix: string | null;
  accountId: string;
  actorId: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  responseMs: number;
}

export interface UsageSummary {
  today: number;
  thisMonth: number;
  byEndpoint: Array<{ endpoint: string; count: number }>;
  byActor: Array<{ actorId: string; count: number }>;
  byStatus: Array<{ statusCode: number; count: number }>;
}

// ============================================================================
// Store interface
// ============================================================================

interface UsageStore {
  record(entry: UsageRecord): void; // fire-and-forget, no await needed
  summarize(accountId: string): Promise<UsageSummary>;
}

// ============================================================================
// In-memory store (dev/testnet)
// ============================================================================

class MemoryUsageStore implements UsageStore {
  private entries: Array<UsageRecord & { createdAt: Date }> = [];

  record(entry: UsageRecord): void {
    this.entries.push({ ...entry, createdAt: new Date() });
    // Cap at 100k entries to prevent unbounded memory growth in dev
    if (this.entries.length > 100_000) {
      this.entries = this.entries.slice(-50_000);
    }
  }

  async summarize(accountId: string): Promise<UsageSummary> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const mine = this.entries.filter((e) => e.accountId === accountId);
    const today = mine.filter((e) => e.createdAt >= startOfDay).length;
    const thisMonth = mine.filter((e) => e.createdAt >= startOfMonth).length;

    // Aggregate by endpoint
    const epMap = new Map<string, number>();
    for (const e of mine) {
      epMap.set(e.endpoint, (epMap.get(e.endpoint) || 0) + 1);
    }

    // Aggregate by actor
    const actorMap = new Map<string, number>();
    for (const e of mine) {
      if (e.actorId) {
        actorMap.set(e.actorId, (actorMap.get(e.actorId) || 0) + 1);
      }
    }

    // Aggregate by status
    const statusMap = new Map<number, number>();
    for (const e of mine) {
      statusMap.set(e.statusCode, (statusMap.get(e.statusCode) || 0) + 1);
    }

    return {
      today,
      thisMonth,
      byEndpoint: [...epMap.entries()]
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count),
      byActor: [...actorMap.entries()]
        .map(([actorId, count]) => ({ actorId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
      byStatus: [...statusMap.entries()]
        .map(([statusCode, count]) => ({ statusCode, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

// ============================================================================
// Hasura/PostgreSQL store (production)
// ============================================================================

class HasuraUsageStore implements UsageStore {
  private url: string;
  private secret: string;

  constructor(hasuraUrl: string, adminSecret: string) {
    this.url = hasuraUrl;
    this.secret = adminSecret;
  }

  private async gql<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': this.secret,
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(`Hasura metering: ${json.errors[0].message}`);
    }
    return json.data!;
  }

  record(entry: UsageRecord): void {
    // Fire-and-forget — errors are logged but never block the response
    this.gql(
      `mutation($obj: api_usage_insert_input!) {
        insert_api_usage_one(object: $obj) { id }
      }`,
      {
        obj: {
          key_prefix: entry.keyPrefix,
          account_id: entry.accountId,
          actor_id: entry.actorId,
          endpoint: entry.endpoint,
          method: entry.method,
          status_code: entry.statusCode,
          response_ms: entry.responseMs,
        },
      }
    ).catch((err) => {
      logger.warn({ err, entry }, 'Failed to record usage (non-fatal)');
    });
  }

  async summarize(accountId: string): Promise<UsageSummary> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    // Two queries: counts + raw rows for aggregation
    const [counts, rows] = await Promise.all([
      this.gql<{
        today: { aggregate: { count: number } };
        month: { aggregate: { count: number } };
      }>(
        `query($acct: String!, $day: timestamptz!, $month: timestamptz!) {
          today: api_usage_aggregate(
            where: { account_id: { _eq: $acct }, created_at: { _gte: $day } }
          ) { aggregate { count } }
          month: api_usage_aggregate(
            where: { account_id: { _eq: $acct }, created_at: { _gte: $month } }
          ) { aggregate { count } }
        }`,
        { acct: accountId, day: startOfDay, month: startOfMonth }
      ),
      this.gql<{
        api_usage: Array<{
          endpoint: string;
          actor_id: string | null;
          status_code: number;
        }>;
      }>(
        `query($acct: String!, $month: timestamptz!) {
          api_usage(
            where: { account_id: { _eq: $acct }, created_at: { _gte: $month } }
            order_by: { created_at: desc }
            limit: 10000
          ) { endpoint actor_id status_code }
        }`,
        { acct: accountId, month: startOfMonth }
      ),
    ]);

    // Aggregate dimensions client-side from raw rows
    const epMap = new Map<string, number>();
    const actorMap = new Map<string, number>();
    const statusMap = new Map<number, number>();

    for (const r of rows.api_usage) {
      epMap.set(r.endpoint, (epMap.get(r.endpoint) || 0) + 1);
      if (r.actor_id) {
        actorMap.set(r.actor_id, (actorMap.get(r.actor_id) || 0) + 1);
      }
      statusMap.set(r.status_code, (statusMap.get(r.status_code) || 0) + 1);
    }

    return {
      today: counts.today.aggregate.count,
      thisMonth: counts.month.aggregate.count,
      byEndpoint: [...epMap.entries()]
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count),
      byActor: [...actorMap.entries()]
        .map(([actorId, count]) => ({ actorId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
      byStatus: [...statusMap.entries()]
        .map(([statusCode, count]) => ({ statusCode, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

// ============================================================================
// Singleton — auto-selects store based on config
// ============================================================================

const store: UsageStore = config.hasuraAdminSecret
  ? new HasuraUsageStore(config.hasuraUrl, config.hasuraAdminSecret)
  : (() => {
      logger.info(
        'Usage metering: in-memory store (no HASURA_ADMIN_SECRET set)'
      );
      return new MemoryUsageStore();
    })();

/** Fire-and-forget: record a single API usage entry. Never throws. */
export function recordUsage(entry: UsageRecord): void {
  try {
    store.record(entry);
  } catch (err) {
    logger.warn({ err }, 'recordUsage failed (non-fatal)');
  }
}

/** Get usage summary for a developer account. */
export async function getUsageSummary(
  accountId: string
): Promise<UsageSummary> {
  return store.summarize(accountId);
}
