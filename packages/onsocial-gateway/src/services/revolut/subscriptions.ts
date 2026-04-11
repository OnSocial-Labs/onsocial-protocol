/**
 * Subscription persistence — dual-store pattern (matches apikeys service).
 *
 * HasuraStore: production (PostgreSQL via Hasura GraphQL).
 * MemoryStore: dev/testnet fallback.
 *
 * Table: developer_subscriptions
 *
 * Schema (Hasura auto-tracks):
 * ```sql
 * CREATE TABLE developer_subscriptions (
 *   id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   account_id     TEXT NOT NULL UNIQUE,
 *   tier           TEXT NOT NULL CHECK (tier IN ('pro', 'scale')),
 *   status         TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'expired')),
 *   revolut_subscription_id   TEXT,
 *   revolut_customer_id       TEXT,
 *   revolut_setup_order_id    TEXT,
 *   revolut_last_order_id     TEXT,
 *   promotion_code            TEXT,
 *   promotion_cycles_remaining INT DEFAULT 0,
 *   current_period_start TIMESTAMPTZ NOT NULL,
 *   current_period_end   TIMESTAMPTZ NOT NULL,
 *   created_at           TIMESTAMPTZ DEFAULT now(),
 *   updated_at           TIMESTAMPTZ DEFAULT now()
 * );
 * ```
 */

import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import type { Tier } from '../../types/index.js';

// --- Types -----------------------------------------------------------------

export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'past_due'
  | 'expired';

export interface SubscriptionRecord {
  id: string;
  accountId: string;
  tier: Tier;
  status: SubscriptionStatus;
  revolutSubscriptionId: string | null;
  revolutCustomerId: string | null;
  revolutSetupOrderId: string | null;
  revolutLastOrderId: string | null;
  promotionCode: string | null;
  promotionCyclesRemaining: number;
  currentPeriodStart: string; // ISO 8601
  currentPeriodEnd: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
}

// --- Store interface -------------------------------------------------------

interface SubscriptionStore {
  upsert(
    record: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'>
  ): Promise<void>;
  getByAccount(accountId: string): Promise<SubscriptionRecord | null>;
  getActiveByAccount(accountId: string): Promise<SubscriptionRecord | null>;
  updateStatus(accountId: string, status: SubscriptionStatus): Promise<void>;
  updatePeriod(
    accountId: string,
    periodStart: string,
    periodEnd: string,
    orderId: string
  ): Promise<void>;
  findBySetupOrderId(setupOrderId: string): Promise<SubscriptionRecord | null>;
  findByRevolutSubscriptionId(
    revolutSubId: string
  ): Promise<SubscriptionRecord | null>;
  listActiveWithRevolutSub(): Promise<SubscriptionRecord[]>;
  decrementPromoCycles(accountId: string): Promise<number>;
}

// --- MemoryStore -----------------------------------------------------------

class MemoryStore implements SubscriptionStore {
  private subs = new Map<string, SubscriptionRecord>();

  async upsert(
    record: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.subs.get(record.accountId);
    this.subs.set(record.accountId, {
      ...record,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }

  async getByAccount(accountId: string): Promise<SubscriptionRecord | null> {
    return this.subs.get(accountId) || null;
  }

  async getActiveByAccount(
    accountId: string
  ): Promise<SubscriptionRecord | null> {
    const sub = this.subs.get(accountId);
    if (!sub) return null;
    if (sub.status !== 'active') return null;
    if (new Date(sub.currentPeriodEnd) < new Date()) return null;
    return sub;
  }

  async updateStatus(
    accountId: string,
    status: SubscriptionStatus
  ): Promise<void> {
    const sub = this.subs.get(accountId);
    if (sub) {
      sub.status = status;
      sub.updatedAt = new Date().toISOString();
    }
  }

  async updatePeriod(
    accountId: string,
    periodStart: string,
    periodEnd: string,
    orderId: string
  ): Promise<void> {
    const sub = this.subs.get(accountId);
    if (sub) {
      sub.currentPeriodStart = periodStart;
      sub.currentPeriodEnd = periodEnd;
      sub.revolutLastOrderId = orderId;
      sub.updatedAt = new Date().toISOString();
    }
  }

  async findBySetupOrderId(
    setupOrderId: string
  ): Promise<SubscriptionRecord | null> {
    for (const sub of this.subs.values()) {
      if (sub.revolutSetupOrderId === setupOrderId) return sub;
    }
    return null;
  }

  async findByRevolutSubscriptionId(
    revolutSubId: string
  ): Promise<SubscriptionRecord | null> {
    for (const sub of this.subs.values()) {
      if (sub.revolutSubscriptionId === revolutSubId) return sub;
    }
    return null;
  }

  async listActiveWithRevolutSub(): Promise<SubscriptionRecord[]> {
    const results: SubscriptionRecord[] = [];
    for (const sub of this.subs.values()) {
      if (sub.status === 'active' && sub.revolutSubscriptionId) {
        results.push(sub);
      }
    }
    return results;
  }

  async decrementPromoCycles(accountId: string): Promise<number> {
    const sub = this.subs.get(accountId);
    if (!sub || sub.promotionCyclesRemaining <= 0) return 0;
    sub.promotionCyclesRemaining -= 1;
    sub.updatedAt = new Date().toISOString();
    return sub.promotionCyclesRemaining;
  }
}

class HasuraStore implements SubscriptionStore {
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
      throw new Error(`Hasura: ${json.errors[0].message}`);
    }
    return json.data!;
  }

  private toRecord(row: Record<string, unknown>): SubscriptionRecord {
    return {
      id: row.id as string,
      accountId: row.account_id as string,
      tier: row.tier as Tier,
      status: row.status as SubscriptionStatus,
      revolutSubscriptionId: (row.revolut_subscription_id as string) || null,
      revolutCustomerId: (row.revolut_customer_id as string) || null,
      revolutSetupOrderId: (row.revolut_setup_order_id as string) || null,
      revolutLastOrderId: (row.revolut_last_order_id as string) || null,
      promotionCode: (row.promotion_code as string) || null,
      promotionCyclesRemaining: (row.promotion_cycles_remaining as number) || 0,
      currentPeriodStart: row.current_period_start as string,
      currentPeriodEnd: row.current_period_end as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private readonly FIELDS = `
    id account_id tier status
    revolut_subscription_id revolut_customer_id revolut_setup_order_id revolut_last_order_id
    promotion_code promotion_cycles_remaining
    current_period_start current_period_end created_at updated_at
  `;

  async upsert(
    record: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    await this.gql(
      `mutation($obj: developer_subscriptions_insert_input!) {
        insert_developer_subscriptions_one(
          object: $obj
          on_conflict: {
            constraint: developer_subscriptions_account_id_key
            update_columns: [tier, status, revolut_subscription_id, revolut_customer_id, revolut_setup_order_id, revolut_last_order_id, promotion_code, promotion_cycles_remaining, current_period_start, current_period_end, updated_at]
          }
        ) { id }
      }`,
      {
        obj: {
          id: record.id,
          account_id: record.accountId,
          tier: record.tier,
          status: record.status,
          revolut_subscription_id: record.revolutSubscriptionId,
          revolut_customer_id: record.revolutCustomerId,
          revolut_setup_order_id: record.revolutSetupOrderId,
          revolut_last_order_id: record.revolutLastOrderId,
          promotion_code: record.promotionCode,
          promotion_cycles_remaining: record.promotionCyclesRemaining,
          current_period_start: record.currentPeriodStart,
          current_period_end: record.currentPeriodEnd,
          updated_at: new Date().toISOString(),
        },
      }
    );
  }

  async getByAccount(accountId: string): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developer_subscriptions: Array<Record<string, unknown>>;
    }>(
      `query($acct: String!) {
        developer_subscriptions(where: { account_id: { _eq: $acct } }, limit: 1) { ${this.FIELDS} }
      }`,
      { acct: accountId }
    );
    return data.developer_subscriptions[0]
      ? this.toRecord(data.developer_subscriptions[0])
      : null;
  }

  async getActiveByAccount(
    accountId: string
  ): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developer_subscriptions: Array<Record<string, unknown>>;
    }>(
      `query($acct: String!, $now: timestamptz!) {
        developer_subscriptions(where: {
          account_id: { _eq: $acct }
          status: { _eq: "active" }
          current_period_end: { _gt: $now }
        }, limit: 1) { ${this.FIELDS} }
      }`,
      { acct: accountId, now: new Date().toISOString() }
    );
    return data.developer_subscriptions[0]
      ? this.toRecord(data.developer_subscriptions[0])
      : null;
  }

  async updateStatus(
    accountId: string,
    status: SubscriptionStatus
  ): Promise<void> {
    await this.gql(
      `mutation($acct: String!, $status: String!, $now: timestamptz!) {
        update_developer_subscriptions(
          where: { account_id: { _eq: $acct } }
          _set: { status: $status, updated_at: $now }
        ) { affected_rows }
      }`,
      { acct: accountId, status, now: new Date().toISOString() }
    );
  }

  async updatePeriod(
    accountId: string,
    periodStart: string,
    periodEnd: string,
    orderId: string
  ): Promise<void> {
    await this.gql(
      `mutation($acct: String!, $start: timestamptz!, $end: timestamptz!, $orderId: String!, $now: timestamptz!) {
        update_developer_subscriptions(
          where: { account_id: { _eq: $acct } }
          _set: {
            current_period_start: $start
            current_period_end: $end
            revolut_last_order_id: $orderId
            status: "active"
            updated_at: $now
          }
        ) { affected_rows }
      }`,
      {
        acct: accountId,
        start: periodStart,
        end: periodEnd,
        orderId,
        now: new Date().toISOString(),
      }
    );
  }

  async findBySetupOrderId(
    setupOrderId: string
  ): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developer_subscriptions: Array<Record<string, unknown>>;
    }>(
      `query($orderId: String!) {
        developer_subscriptions(where: { revolut_setup_order_id: { _eq: $orderId } }, limit: 1) { ${this.FIELDS} }
      }`,
      { orderId: setupOrderId }
    );
    return data.developer_subscriptions[0]
      ? this.toRecord(data.developer_subscriptions[0])
      : null;
  }

  async findByRevolutSubscriptionId(
    revolutSubId: string
  ): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developer_subscriptions: Array<Record<string, unknown>>;
    }>(
      `query($subId: String!) {
        developer_subscriptions(where: { revolut_subscription_id: { _eq: $subId } }, limit: 1) { ${this.FIELDS} }
      }`,
      { subId: revolutSubId }
    );
    return data.developer_subscriptions[0]
      ? this.toRecord(data.developer_subscriptions[0])
      : null;
  }

  async listActiveWithRevolutSub(): Promise<SubscriptionRecord[]> {
    const data = await this.gql<{
      developer_subscriptions: Array<Record<string, unknown>>;
    }>(
      `query {
        developer_subscriptions(where: {
          status: { _eq: "active" }
          revolut_subscription_id: { _is_null: false }
        }) { ${this.FIELDS} }
      }`
    );
    return data.developer_subscriptions.map((r) => this.toRecord(r));
  }

  async decrementPromoCycles(accountId: string): Promise<number> {
    const data = await this.gql<{
      update_developer_subscriptions: {
        returning: Array<{ promotion_cycles_remaining: number }>;
      };
    }>(
      `mutation($acct: String!, $now: timestamptz!) {
        update_developer_subscriptions(
          where: { account_id: { _eq: $acct }, promotion_cycles_remaining: { _gt: 0 } }
          _inc: { promotion_cycles_remaining: -1 }
          _set: { updated_at: $now }
        ) { returning { promotion_cycles_remaining } }
      }`,
      { acct: accountId, now: new Date().toISOString() }
    );
    return (
      data.update_developer_subscriptions.returning[0]
        ?.promotion_cycles_remaining ?? 0
    );
  }
}

// --- Singleton -------------------------------------------------------------

function createStore(): SubscriptionStore {
  if (config.hasuraAdminSecret && config.nodeEnv === 'production') {
    logger.info('Subscription store: Hasura/PostgreSQL');
    return new HasuraStore(config.hasuraUrl, config.hasuraAdminSecret);
  }
  logger.info('Subscription store: in-memory');
  return new MemoryStore();
}

export const subscriptionStore = createStore();
