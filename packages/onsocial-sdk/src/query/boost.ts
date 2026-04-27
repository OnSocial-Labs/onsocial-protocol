// ---------------------------------------------------------------------------
// Boost contract event queries (lock / unlock / claim / credits / pool ops).
// Accessed as `os.query.boost.<method>()`.
//
// Backed by three tables populated by the boost substreams indexer:
//   - `boost_events`           — full event stream.
//   - `booster_state`          — current per-account state (locked amount,
//                                effective boost, total claimed/purchased).
//   - `boost_credit_purchases` — focused history of CREDITS_PURCHASE events.
//
// For *live* on-chain numbers (current claimable rewards, real-time
// reward rate, lock expiry countdown) call the boost contract directly via
// `boost.get_account` / `boost.get_lock_status` / `boost.get_reward_rate` —
// this namespace is for indexed history and aggregations only.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/**
 * A single row from `boost_events`. Most columns are sparse — populated
 * only for the relevant `eventType` — so consumers should branch on it.
 */
export interface BoostEventRow {
  /** Unique receipt-derived id. */
  id: string;
  /** Event tag — see {@link BOOST_EVENT_TYPES}. */
  eventType: string;
  /** Subject account; for protocol events (REWARDS_RELEASED, OWNER_CHANGED,
   *  CONTRACT_UPGRADE) this is the contract account. */
  accountId: string;
  /** False for `*_FAILED` events — state was rolled back. */
  success: boolean;
  blockHeight: number;
  blockTimestamp: number;
  receiptId: string;

  // ── Common amount fields ───────────────────────────────────────────────
  /** yoctoSOCIAL string. Meaning depends on `eventType`. */
  amount: string | null;
  /** Effective boost after the event (yoctoSOCIAL string). */
  effectiveBoost: string | null;

  // ── Lock / extend fields ───────────────────────────────────────────────
  months: number | null;
  newMonths: number | null;
  newEffectiveBoost: string | null;

  // ── Reward release fields ──────────────────────────────────────────────
  elapsedNs: string | null;
  totalReleased: string | null;
  remainingPool: string | null;

  // ── Credits / pool fields ──────────────────────────────────────────────
  infraShare: string | null;
  rewardsShare: string | null;
  totalPool: string | null;

  // ── Infra withdraw / owner change ──────────────────────────────────────
  receiverId: string | null;
  oldOwner: string | null;
  newOwner: string | null;

  // ── Contract upgrade ───────────────────────────────────────────────────
  oldVersion: string | null;
  newVersion: string | null;

  // ── Storage deposit ────────────────────────────────────────────────────
  deposit: string | null;

  /** Full JSON catch-all for forward-compat with new event types. */
  extraData: string | null;
}

/** A single row from `booster_state` — current totals per account. */
export interface BoosterStateRow {
  accountId: string;
  /** yoctoSOCIAL string. */
  lockedAmount: string;
  /** yoctoSOCIAL string (locked × time-lock multiplier). */
  effectiveBoost: string;
  /** Lock period in months (one of 1, 6, 12, 24, 48; 0 if not locked). */
  lockMonths: number;
  /** yoctoSOCIAL string — cumulative rewards claimed. */
  totalClaimed: string;
  /** yoctoSOCIAL string — cumulative SOCIAL spent on credits. */
  totalCreditsPurchased: string;
  lastEventType: string | null;
  lastEventBlock: number;
  /** Last update timestamp (ns since epoch). */
  updatedAt: number;
}

/** A single row from `boost_credit_purchases`. */
export interface BoostCreditPurchaseRow {
  id: string;
  blockHeight: number;
  blockTimestamp: number;
  receiptId: string;
  accountId: string;
  /** yoctoSOCIAL string — gross amount sent. */
  amount: string;
  /** yoctoSOCIAL string — share routed to infra pool (60%). */
  infraShare: string;
  /** yoctoSOCIAL string — share routed to scheduled rewards pool (40%). */
  rewardsShare: string;
}

const BOOST_EVENT_FIELDS = `
  id
  eventType
  accountId
  success
  blockHeight
  blockTimestamp
  receiptId
  amount
  effectiveBoost
  months
  newMonths
  newEffectiveBoost
  elapsedNs
  totalReleased
  remainingPool
  infraShare
  rewardsShare
  totalPool
  receiverId
  oldOwner
  newOwner
  oldVersion
  newVersion
  deposit
  extraData
`;

const BOOSTER_STATE_FIELDS = `
  accountId
  lockedAmount
  effectiveBoost
  lockMonths
  totalClaimed
  totalCreditsPurchased
  lastEventType
  lastEventBlock
  updatedAt
`;

const CREDIT_PURCHASE_FIELDS = `
  id
  blockHeight
  blockTimestamp
  receiptId
  accountId
  amount
  infraShare
  rewardsShare
`;

/**
 * Literal `event_type` strings emitted by the boost contract. Exported for
 * callers that want to filter via {@link BoostQuery.events} or
 * `os.query.graphql`.
 */
export const BOOST_EVENT_TYPES = {
  BOOST_LOCK: 'BOOST_LOCK',
  BOOST_EXTEND: 'BOOST_EXTEND',
  BOOST_UNLOCK: 'BOOST_UNLOCK',
  UNLOCK_FAILED: 'UNLOCK_FAILED',
  REWARDS_CLAIM: 'REWARDS_CLAIM',
  CLAIM_FAILED: 'CLAIM_FAILED',
  REWARDS_RELEASED: 'REWARDS_RELEASED',
  CREDITS_PURCHASE: 'CREDITS_PURCHASE',
  SCHEDULED_FUND: 'SCHEDULED_FUND',
  STORAGE_DEPOSIT: 'STORAGE_DEPOSIT',
  INFRA_WITHDRAW: 'INFRA_WITHDRAW',
  WITHDRAW_INFRA_FAILED: 'WITHDRAW_INFRA_FAILED',
  OWNER_CHANGED: 'OWNER_CHANGED',
  CONTRACT_UPGRADE: 'CONTRACT_UPGRADE',
} as const;

export class BoostQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Generic event filter — every other helper in this namespace is a thin
   * specialization of this. Filters are AND-ed together; pass arrays to
   * `eventType` for `_in` matching.
   */
  async events(
    opts: {
      eventType?: string | string[];
      accountId?: string;
      success?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<BoostEventRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = { limit, offset };
    const wheres: string[] = [];
    const params: string[] = ['$limit: Int!', '$offset: Int!'];

    const addEq = (col: string, key: string, val: unknown, gqlType: string) => {
      wheres.push(`${col}: {_eq: $${key}}`);
      params.push(`$${key}: ${gqlType}`);
      variables[key] = val;
    };
    const addIn = (
      col: string,
      key: string,
      vals: unknown[],
      gqlType: string
    ) => {
      wheres.push(`${col}: {_in: $${key}}`);
      params.push(`$${key}: [${gqlType}!]!`);
      variables[key] = vals;
    };

    if (opts.eventType !== undefined) {
      if (Array.isArray(opts.eventType)) {
        addIn('eventType', 'eventType', opts.eventType, 'String');
      } else {
        addEq('eventType', 'eventType', opts.eventType, 'String!');
      }
    }
    if (opts.accountId)
      addEq('accountId', 'accountId', opts.accountId, 'String!');
    if (opts.success !== undefined)
      addEq('success', 'success', opts.success, 'Boolean!');

    const whereClause = wheres.length ? `where: { ${wheres.join(', ')} },` : '';
    const res = await this._q.graphql<{
      boostEvents: BoostEventRow[];
    }>({
      query: `query BoostEvents(${params.join(', ')}) {
        boostEvents(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${BOOST_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.boostEvents ?? [];
  }

  /** Current totals for a single account, or `null` if never locked. */
  async state(accountId: string): Promise<BoosterStateRow | null> {
    const res = await this._q.graphql<{
      boosterState: BoosterStateRow[];
    }>({
      query: `query BoosterState($accountId: String!) {
        boosterState(
          where: { accountId: {_eq: $accountId} },
          limit: 1
        ) { ${BOOSTER_STATE_FIELDS} }
      }`,
      variables: { accountId },
    });
    return res.data?.boosterState?.[0] ?? null;
  }

  /** Top boosters by `effective_boost`, descending. Useful for leaderboards. */
  async topBoosters(
    opts: { limit?: number; offset?: number } = {}
  ): Promise<BoosterStateRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      boosterState: BoosterStateRow[];
    }>({
      query: `query TopBoosters($limit: Int!, $offset: Int!) {
        boosterState(
          limit: $limit,
          offset: $offset,
          orderBy: [{effectiveBoost: DESC}]
        ) { ${BOOSTER_STATE_FIELDS} }
      }`,
      variables: { limit, offset },
    });
    return res.data?.boosterState ?? [];
  }

  /** Top boosters by raw `locked_amount`, descending. */
  async topLocked(
    opts: { limit?: number; offset?: number } = {}
  ): Promise<BoosterStateRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      boosterState: BoosterStateRow[];
    }>({
      query: `query TopLocked($limit: Int!, $offset: Int!) {
        boosterState(
          limit: $limit,
          offset: $offset,
          orderBy: [{lockedAmount: DESC}]
        ) { ${BOOSTER_STATE_FIELDS} }
      }`,
      variables: { limit, offset },
    });
    return res.data?.boosterState ?? [];
  }

  /** Recent locks across the protocol, newest first. */
  async recentLocks(opts: { limit?: number } = {}): Promise<BoostEventRow[]> {
    return this.events({
      eventType: BOOST_EVENT_TYPES.BOOST_LOCK,
      limit: opts.limit,
    });
  }

  /** Recent successful unlocks, newest first. */
  async recentUnlocks(opts: { limit?: number } = {}): Promise<BoostEventRow[]> {
    return this.events({
      eventType: BOOST_EVENT_TYPES.BOOST_UNLOCK,
      limit: opts.limit,
    });
  }

  /** Recent successful reward claims, newest first. */
  async recentClaims(opts: { limit?: number } = {}): Promise<BoostEventRow[]> {
    return this.events({
      eventType: BOOST_EVENT_TYPES.REWARDS_CLAIM,
      limit: opts.limit,
    });
  }

  /** Recent global reward releases (auto-triggered by user actions). */
  async recentReleases(
    opts: { limit?: number } = {}
  ): Promise<BoostEventRow[]> {
    return this.events({
      eventType: BOOST_EVENT_TYPES.REWARDS_RELEASED,
      limit: opts.limit,
    });
  }

  /** All events for a single account, newest first. */
  async accountActivity(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<BoostEventRow[]> {
    return this.events({
      accountId,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  /**
   * Credit purchases (`CREDITS_PURCHASE`) from the focused history table.
   * Optionally narrow by account.
   */
  async creditPurchases(
    opts: { accountId?: string; limit?: number; offset?: number } = {}
  ): Promise<BoostCreditPurchaseRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = { limit, offset };
    const params: string[] = ['$limit: Int!', '$offset: Int!'];
    const wheres: string[] = [];
    if (opts.accountId) {
      wheres.push('accountId: {_eq: $accountId}');
      params.push('$accountId: String!');
      variables.accountId = opts.accountId;
    }
    const whereClause = wheres.length ? `where: { ${wheres.join(', ')} },` : '';
    const res = await this._q.graphql<{
      boostCreditPurchases: BoostCreditPurchaseRow[];
    }>({
      query: `query BoostCreditPurchases(${params.join(', ')}) {
        boostCreditPurchases(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${CREDIT_PURCHASE_FIELDS} }
      }`,
      variables,
    });
    return res.data?.boostCreditPurchases ?? [];
  }
}
