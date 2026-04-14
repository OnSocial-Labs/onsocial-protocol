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
 *   status         TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'pending', 'expired')),
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
  | 'pending'
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
  /** Subscription whose paid period has not yet ended (any status). */
  getWithValidPeriod(accountId: string): Promise<SubscriptionRecord | null>;
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

  async getWithValidPeriod(
    accountId: string
  ): Promise<SubscriptionRecord | null> {
    const sub = this.subs.get(accountId);
    if (!sub) return null;
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

export class HasuraStore implements SubscriptionStore {
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
      accountId: row.accountId as string,
      tier: row.tier as Tier,
      status: row.status as SubscriptionStatus,
      revolutSubscriptionId: (row.revolutSubscriptionId as string) || null,
      revolutCustomerId: (row.revolutCustomerId as string) || null,
      revolutSetupOrderId: (row.revolutSetupOrderId as string) || null,
      revolutLastOrderId: (row.revolutLastOrderId as string) || null,
      promotionCode: (row.promotionCode as string) || null,
      promotionCyclesRemaining: (row.promotionCyclesRemaining as number) || 0,
      currentPeriodStart: row.currentPeriodStart as string,
      currentPeriodEnd: row.currentPeriodEnd as string,
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    };
  }

  private readonly FIELDS = `
    id accountId tier status
    revolutSubscriptionId revolutCustomerId revolutSetupOrderId revolutLastOrderId
    promotionCode promotionCyclesRemaining
    currentPeriodStart currentPeriodEnd createdAt updatedAt
  `;

  private isOnConflictUnsupported(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes("has no argument named 'on_conflict'")
    );
  }

  private async insert(
    record: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'>
  ) {
    await this.gql(
      `mutation($obj: developerSubscriptionsInsertInput!) {
        insertDeveloperSubscriptionsOne(object: $obj) { id }
      }`,
      {
        obj: {
          id: record.id,
          accountId: record.accountId,
          tier: record.tier,
          status: record.status,
          revolutSubscriptionId: record.revolutSubscriptionId,
          revolutCustomerId: record.revolutCustomerId,
          revolutSetupOrderId: record.revolutSetupOrderId,
          revolutLastOrderId: record.revolutLastOrderId,
          promotionCode: record.promotionCode,
          promotionCyclesRemaining: record.promotionCyclesRemaining,
          currentPeriodStart: record.currentPeriodStart,
          currentPeriodEnd: record.currentPeriodEnd,
          updatedAt: new Date().toISOString(),
        },
      }
    );
  }

  private async update(
    record: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'>
  ) {
    await this.gql(
      `mutation(
        $acct: String!
        $tier: String!
        $status: String!
        $revolutSubscriptionId: String
        $revolutCustomerId: String
        $revolutSetupOrderId: String
        $revolutLastOrderId: String
        $promotionCode: String
        $promotionCyclesRemaining: Int!
        $currentPeriodStart: timestamptz!
        $currentPeriodEnd: timestamptz!
        $now: timestamptz!
      ) {
        updateDeveloperSubscriptions(
          where: { accountId: { _eq: $acct } }
          _set: {
            tier: $tier
            status: $status
            revolutSubscriptionId: $revolutSubscriptionId
            revolutCustomerId: $revolutCustomerId
            revolutSetupOrderId: $revolutSetupOrderId
            revolutLastOrderId: $revolutLastOrderId
            promotionCode: $promotionCode
            promotionCyclesRemaining: $promotionCyclesRemaining
            currentPeriodStart: $currentPeriodStart
            currentPeriodEnd: $currentPeriodEnd
            updatedAt: $now
          }
        ) { affectedRows }
      }`,
      {
        acct: record.accountId,
        tier: record.tier,
        status: record.status,
        revolutSubscriptionId: record.revolutSubscriptionId,
        revolutCustomerId: record.revolutCustomerId,
        revolutSetupOrderId: record.revolutSetupOrderId,
        revolutLastOrderId: record.revolutLastOrderId,
        promotionCode: record.promotionCode,
        promotionCyclesRemaining: record.promotionCyclesRemaining,
        currentPeriodStart: record.currentPeriodStart,
        currentPeriodEnd: record.currentPeriodEnd,
        now: new Date().toISOString(),
      }
    );
  }

  async upsert(
    record: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    try {
      await this.gql(
        `mutation($obj: developerSubscriptionsInsertInput!) {
          insertDeveloperSubscriptionsOne(
            object: $obj
            on_conflict: {
              constraint: developerSubscriptionsAccountIdKey
              update_columns: [tier, status, revolutSubscriptionId, revolutCustomerId, revolutSetupOrderId, revolutLastOrderId, promotionCode, promotionCyclesRemaining, currentPeriodStart, currentPeriodEnd, updatedAt]
            }
          ) { id }
        }`,
        {
          obj: {
            id: record.id,
            accountId: record.accountId,
            tier: record.tier,
            status: record.status,
            revolutSubscriptionId: record.revolutSubscriptionId,
            revolutCustomerId: record.revolutCustomerId,
            revolutSetupOrderId: record.revolutSetupOrderId,
            revolutLastOrderId: record.revolutLastOrderId,
            promotionCode: record.promotionCode,
            promotionCyclesRemaining: record.promotionCyclesRemaining,
            currentPeriodStart: record.currentPeriodStart,
            currentPeriodEnd: record.currentPeriodEnd,
            updatedAt: new Date().toISOString(),
          },
        }
      );
    } catch (error) {
      if (!this.isOnConflictUnsupported(error)) {
        throw error;
      }

      const existing = await this.getByAccount(record.accountId);
      if (existing) {
        await this.update(record);
        return;
      }

      await this.insert(record);
    }
  }

  async getByAccount(accountId: string): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developerSubscriptions: Array<Record<string, unknown>>;
    }>(
      `query($acct: String!) {
        developerSubscriptions(where: { accountId: { _eq: $acct } }, limit: 1) { ${this.FIELDS} }
      }`,
      { acct: accountId }
    );
    return data.developerSubscriptions[0]
      ? this.toRecord(data.developerSubscriptions[0])
      : null;
  }

  async getActiveByAccount(
    accountId: string
  ): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developerSubscriptions: Array<Record<string, unknown>>;
    }>(
      `query($acct: String!, $now: timestamptz!) {
        developerSubscriptions(where: {
          accountId: { _eq: $acct }
          status: { _eq: "active" }
          currentPeriodEnd: { _gt: $now }
        }, limit: 1) { ${this.FIELDS} }
      }`,
      { acct: accountId, now: new Date().toISOString() }
    );
    return data.developerSubscriptions[0]
      ? this.toRecord(data.developerSubscriptions[0])
      : null;
  }

  async getWithValidPeriod(
    accountId: string
  ): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developerSubscriptions: Array<Record<string, unknown>>;
    }>(
      `query($acct: String!, $now: timestamptz!) {
        developerSubscriptions(where: {
          accountId: { _eq: $acct }
          currentPeriodEnd: { _gt: $now }
        }, limit: 1) { ${this.FIELDS} }
      }`,
      { acct: accountId, now: new Date().toISOString() }
    );
    return data.developerSubscriptions[0]
      ? this.toRecord(data.developerSubscriptions[0])
      : null;
  }

  async updateStatus(
    accountId: string,
    status: SubscriptionStatus
  ): Promise<void> {
    await this.gql(
      `mutation($acct: String!, $status: String!, $now: timestamptz!) {
        updateDeveloperSubscriptions(
          where: { accountId: { _eq: $acct } }
          _set: { status: $status, updatedAt: $now }
        ) { affectedRows }
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
        updateDeveloperSubscriptions(
          where: { accountId: { _eq: $acct } }
          _set: {
            currentPeriodStart: $start
            currentPeriodEnd: $end
            revolutLastOrderId: $orderId
            status: "active"
            updatedAt: $now
          }
        ) { affectedRows }
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
      developerSubscriptions: Array<Record<string, unknown>>;
    }>(
      `query($orderId: String!) {
        developerSubscriptions(where: { revolutSetupOrderId: { _eq: $orderId } }, limit: 1) { ${this.FIELDS} }
      }`,
      { orderId: setupOrderId }
    );
    return data.developerSubscriptions[0]
      ? this.toRecord(data.developerSubscriptions[0])
      : null;
  }

  async findByRevolutSubscriptionId(
    revolutSubId: string
  ): Promise<SubscriptionRecord | null> {
    const data = await this.gql<{
      developerSubscriptions: Array<Record<string, unknown>>;
    }>(
      `query($subId: String!) {
        developerSubscriptions(where: { revolutSubscriptionId: { _eq: $subId } }, limit: 1) { ${this.FIELDS} }
      }`,
      { subId: revolutSubId }
    );
    return data.developerSubscriptions[0]
      ? this.toRecord(data.developerSubscriptions[0])
      : null;
  }

  async listActiveWithRevolutSub(): Promise<SubscriptionRecord[]> {
    const data = await this.gql<{
      developerSubscriptions: Array<Record<string, unknown>>;
    }>(
      `query {
        developerSubscriptions(where: {
          status: { _eq: "active" }
          revolutSubscriptionId: { _is_null: false }
        }) { ${this.FIELDS} }
      }`
    );
    return data.developerSubscriptions.map((r) => this.toRecord(r));
  }

  async decrementPromoCycles(accountId: string): Promise<number> {
    const data = await this.gql<{
      updateDeveloperSubscriptions: {
        returning: Array<{ promotionCyclesRemaining: number }>;
      };
    }>(
      `mutation($acct: String!, $now: timestamptz!) {
        updateDeveloperSubscriptions(
          where: { accountId: { _eq: $acct }, promotionCyclesRemaining: { _gt: 0 } }
          _inc: { promotionCyclesRemaining: -1 }
          _set: { updatedAt: $now }
        ) { returning { promotionCyclesRemaining } }
      }`,
      { acct: accountId, now: new Date().toISOString() }
    );
    return (
      data.updateDeveloperSubscriptions.returning[0]
        ?.promotionCyclesRemaining ?? 0
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
