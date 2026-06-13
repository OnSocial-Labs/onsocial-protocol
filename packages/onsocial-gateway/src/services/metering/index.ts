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
import { Pool } from 'pg';
import {
  DEFAULT_TIMELINE,
  buildUsageTimeline,
  buildUsageTimelineFromRows,
  type TimelineEntry,
  type UsageTimeline,
  type UsageTimelineParams,
} from './timeline.js';

export {
  DEFAULT_TIMELINE,
  parseTimelineQuery,
  type UsageTimeline,
  type UsageTimelinePoint,
  type UsageTimelineParams,
} from './timeline.js';

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
  /** HTTP 429 responses today (burst limit exceeded). */
  rateLimitedToday: number;
  /** HTTP 429 responses this calendar month. */
  rateLimitedThisMonth: number;
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
  timeline(
    accountId: string,
    params: UsageTimelineParams
  ): Promise<UsageTimeline>;
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
    const todayEntries = mine.filter((e) => e.createdAt >= startOfDay);
    const monthEntries = mine.filter((e) => e.createdAt >= startOfMonth);
    const today = todayEntries.length;
    const thisMonth = monthEntries.length;
    const rateLimitedToday = todayEntries.filter(
      (e) => e.statusCode === 429
    ).length;
    const rateLimitedThisMonth = monthEntries.filter(
      (e) => e.statusCode === 429
    ).length;

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
      rateLimitedToday,
      rateLimitedThisMonth,
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

  async timeline(
    accountId: string,
    params: UsageTimelineParams
  ): Promise<UsageTimeline> {
    const now = new Date();
    const since = new Date(now.getTime() - params.windowSec * 1000);
    const entries: TimelineEntry[] = this.entries
      .filter(
        (entry) => entry.accountId === accountId && entry.createdAt >= since
      )
      .map((entry) => ({
        createdAt: entry.createdAt,
        statusCode: entry.statusCode,
      }));

    return buildUsageTimeline(entries, now, params);
  }
}

// ============================================================================
// Hasura/PostgreSQL store (production)
// ============================================================================

class HasuraUsageStore implements UsageStore {
  private url: string;
  private secret: string;
  private pool: Pool | null;

  constructor(
    hasuraUrl: string,
    adminSecret: string,
    pool: Pool | null = null
  ) {
    this.url = hasuraUrl;
    this.secret = adminSecret;
    this.pool = pool;
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
      `mutation($obj: ApiUsageInsertInput!) {
        insertApiUsageOne(object: $obj) { id }
      }`,
      {
        obj: {
          keyPrefix: entry.keyPrefix,
          accountId: entry.accountId,
          actorId: entry.actorId,
          endpoint: entry.endpoint,
          method: entry.method,
          statusCode: entry.statusCode,
          responseMs: entry.responseMs,
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
        rateLimitedToday: { aggregate: { count: number } };
        rateLimitedMonth: { aggregate: { count: number } };
      }>(
        `query($acct: String!, $day: timestamptz!, $month: timestamptz!) {
          today: apiUsageAggregate(
            where: { accountId: { _eq: $acct }, createdAt: { _gte: $day } }
          ) { aggregate { count } }
          month: apiUsageAggregate(
            where: { accountId: { _eq: $acct }, createdAt: { _gte: $month } }
          ) { aggregate { count } }
          rateLimitedToday: apiUsageAggregate(
            where: {
              accountId: { _eq: $acct }
              createdAt: { _gte: $day }
              statusCode: { _eq: 429 }
            }
          ) { aggregate { count } }
          rateLimitedMonth: apiUsageAggregate(
            where: {
              accountId: { _eq: $acct }
              createdAt: { _gte: $month }
              statusCode: { _eq: 429 }
            }
          ) { aggregate { count } }
        }`,
        { acct: accountId, day: startOfDay, month: startOfMonth }
      ),
      this.gql<{
        apiUsage: Array<{
          endpoint: string;
          actorId: string | null;
          statusCode: number;
        }>;
      }>(
        `query($acct: String!, $month: timestamptz!) {
          apiUsage(
            where: { accountId: { _eq: $acct }, createdAt: { _gte: $month } }
            orderBy: { createdAt: DESC }
            limit: 10000
          ) { endpoint actorId statusCode }
        }`,
        { acct: accountId, month: startOfMonth }
      ),
    ]);

    // Aggregate dimensions client-side from raw rows
    const epMap = new Map<string, number>();
    const actorMap = new Map<string, number>();
    const statusMap = new Map<number, number>();

    for (const r of rows.apiUsage) {
      epMap.set(r.endpoint, (epMap.get(r.endpoint) || 0) + 1);
      if (r.actorId) {
        actorMap.set(r.actorId, (actorMap.get(r.actorId) || 0) + 1);
      }
      statusMap.set(r.statusCode, (statusMap.get(r.statusCode) || 0) + 1);
    }

    return {
      today: counts.today.aggregate.count,
      thisMonth: counts.month.aggregate.count,
      rateLimitedToday: counts.rateLimitedToday.aggregate.count,
      rateLimitedThisMonth: counts.rateLimitedMonth.aggregate.count,
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

  async timeline(
    accountId: string,
    params: UsageTimelineParams
  ): Promise<UsageTimeline> {
    const now = new Date();
    const since = new Date(now.getTime() - params.windowSec * 1000);

    if (this.pool) {
      const result = await this.pool.query<{
        bucket_ms: string;
        count: number;
        rate_limited: number;
      }>(
        `SELECT
           (floor(extract(epoch from created_at) / $3) * $3 * 1000)::bigint AS bucket_ms,
           count(*)::int AS count,
           count(*) FILTER (WHERE status_code = 429)::int AS rate_limited
         FROM api_usage
         WHERE account_id = $1
           AND created_at >= $2
         GROUP BY 1
         ORDER BY 1 ASC`,
        [accountId, since.toISOString(), params.bucketSec]
      );

      return buildUsageTimelineFromRows(
        result.rows.map((row) => ({
          bucketMs: Number(row.bucket_ms),
          count: row.count,
          rateLimited: row.rate_limited,
        })),
        now,
        params
      );
    }

    const rows = await this.gql<{
      apiUsage: Array<{ createdAt: string; statusCode: number }>;
    }>(
      `query($acct: String!, $since: timestamptz!) {
        apiUsage(
          where: { accountId: { _eq: $acct }, createdAt: { _gte: $since } }
          orderBy: { createdAt: ASC }
          limit: 50000
        ) { createdAt statusCode }
      }`,
      { acct: accountId, since: since.toISOString() }
    );

    const entries: TimelineEntry[] = rows.apiUsage.map((row) => ({
      createdAt: new Date(row.createdAt),
      statusCode: row.statusCode,
    }));

    return buildUsageTimeline(entries, now, params);
  }
}

// ============================================================================
// Singleton — auto-selects store based on config
// ============================================================================

const databaseUrl = process.env.DATABASE_URL;
const usagePool = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : null;

const store: UsageStore = config.hasuraAdminSecret
  ? new HasuraUsageStore(config.hasuraUrl, config.hasuraAdminSecret, usagePool)
  : (() => {
      logger.info(
        'Usage metering: in-memory store (no HASURA_ADMIN_SECRET set)'
      );
      return new MemoryUsageStore();
    })();

if (usagePool) {
  logger.info('Usage metering timeline: PostgreSQL buckets enabled');
}

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

/** Get time-bucketed usage for burst / spike monitoring. */
export async function getUsageTimeline(
  accountId: string,
  params: UsageTimelineParams = DEFAULT_TIMELINE
): Promise<UsageTimeline> {
  return store.timeline(accountId, params);
}
