// ---------------------------------------------------------------------------
// Rewards event queries (credits, claims, pool deposits, admin updates).
// Accessed as `os.query.rewards.<method>()`.
//
// Backed by two tables populated by the rewards substreams indexer:
//   - `rewards_events`     — full event stream (credit, claim, pool deposit,
//                            admin updates, contract upgrades).
//   - `user_reward_state`  — current per-user totals (total earned, total
//                            claimed, last credit/claim block).
//
// For *current* on-chain state of an app config or per-user-per-app earnings
// (e.g. "what is alice.near's daily earned for app `chat` right now?"), call
// the partner backend (`os.rewards.getBalance(...)`) or the rewards contract
// view methods directly. Use this namespace when you need history, leader-
// board-style aggregations, or activity feeds.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/**
 * A single row from `rewards_events`. Most columns are sparse — they're
 * populated only for the relevant `event_type` — so consumers should branch
 * on `eventType` when reading the result rows.
 */
export interface RewardsEventRow {
  /** Unique receipt-derived id. */
  id: string;
  /** Event tag (see {@link REWARDS_EVENT_TYPES}). */
  eventType: string;
  /** Subject account: rewarded user for credit/claim, owner for admin ops. */
  accountId: string;
  /** True for `REWARD_CREDITED` / `REWARD_CLAIMED`, false for `CLAIM_FAILED`. */
  success: boolean;
  blockHeight: number;
  blockTimestamp: number;
  receiptId: string;

  // ── Credit / claim fields ──────────────────────────────────────────────
  /** yoctoSOCIAL string for credit/claim/pool-deposit, null otherwise. */
  amount: string | null;
  /** Free-text label passed by the caller on credit (e.g. `engagement`). */
  source: string | null;
  /** Account that signed the credit (owner, executor, or app caller). */
  creditedBy: string | null;
  /** App scope for app-budgeted credits, null for global credits. */
  appId: string | null;

  // ── Pool deposit ───────────────────────────────────────────────────────
  /** Pool balance after the deposit (yoctoSOCIAL string). */
  newBalance: string | null;

  // ── Owner change ───────────────────────────────────────────────────────
  oldOwner: string | null;
  newOwner: string | null;

  // ── Max-daily change ───────────────────────────────────────────────────
  oldMax: string | null;
  newMax: string | null;

  // ── Executor / caller add/remove ───────────────────────────────────────
  executor: string | null;
  caller: string | null;

  // ── Contract upgrade ───────────────────────────────────────────────────
  oldVersion: string | null;
  newVersion: string | null;

  /** Full JSON catch-all for forward-compat with new event types. */
  extraData: string | null;
}

/** A single row from `user_reward_state` — current totals per account. */
export interface UserRewardStateRow {
  accountId: string;
  /** yoctoSOCIAL string. */
  totalEarned: string;
  /** yoctoSOCIAL string. */
  totalClaimed: string;
  lastCreditBlock: number;
  lastClaimBlock: number;
  /** Last update timestamp (ns since epoch). */
  updatedAt: number;
}

const REWARDS_EVENT_FIELDS = `
  id
  eventType
  accountId
  success
  blockHeight
  blockTimestamp
  receiptId
  amount
  source
  creditedBy
  appId
  newBalance
  oldOwner
  newOwner
  oldMax
  newMax
  executor
  caller
  oldVersion
  newVersion
  extraData
`;

const USER_REWARD_STATE_FIELDS = `
  accountId
  totalEarned
  totalClaimed
  lastCreditBlock
  lastClaimBlock
  updatedAt
`;

/**
 * Literal `event_type` strings emitted by the rewards contract. Exported for
 * callers that want to filter via {@link RewardsQuery.events} or
 * `os.query.graphql`.
 */
export const REWARDS_EVENT_TYPES = {
  REWARD_CREDITED: 'REWARD_CREDITED',
  REWARD_CLAIMED: 'REWARD_CLAIMED',
  CLAIM_FAILED: 'CLAIM_FAILED',
  POOL_DEPOSIT: 'POOL_DEPOSIT',
  OWNER_CHANGED: 'OWNER_CHANGED',
  MAX_DAILY_UPDATED: 'MAX_DAILY_UPDATED',
  EXECUTOR_ADDED: 'EXECUTOR_ADDED',
  EXECUTOR_REMOVED: 'EXECUTOR_REMOVED',
  CALLER_ADDED: 'CALLER_ADDED',
  CALLER_REMOVED: 'CALLER_REMOVED',
  CONTRACT_UPGRADE: 'CONTRACT_UPGRADE',
} as const;

export class RewardsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Generic event filter — every other helper in this namespace is a thin
   * specialization of this. Filters are AND-ed together; pass arrays to
   * `eventType` for `_in` matching.
   *
   * ```ts
   * await os.query.rewards.events({
   *   eventType: ['REWARD_CREDITED', 'REWARD_CLAIMED'],
   *   accountId: 'alice.near',
   *   limit: 25,
   * });
   * ```
   */
  async events(
    opts: {
      eventType?: string | string[];
      accountId?: string;
      appId?: string;
      creditedBy?: string;
      source?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<RewardsEventRow[]> {
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
    if (opts.appId) addEq('appId', 'appId', opts.appId, 'String!');
    if (opts.creditedBy)
      addEq('creditedBy', 'creditedBy', opts.creditedBy, 'String!');
    if (opts.source) addEq('source', 'source', opts.source, 'String!');

    const whereClause = wheres.length ? `where: { ${wheres.join(', ')} },` : '';
    const res = await this._q.graphql<{
      rewardsEvents: RewardsEventRow[];
    }>({
      query: `query RewardsEvents(${params.join(', ')}) {
        rewardsEvents(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${REWARDS_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.rewardsEvents ?? [];
  }

  /**
   * Current reward totals for a single account from `user_reward_state`, or
   * `null` if the account has never received a reward.
   *
   * ```ts
   * const state = await os.query.rewards.userState('alice.near');
   * ```
   */
  async userState(accountId: string): Promise<UserRewardStateRow | null> {
    const res = await this._q.graphql<{
      userRewardState: UserRewardStateRow[];
    }>({
      query: `query UserRewardState($accountId: String!) {
        userRewardState(
          where: { accountId: {_eq: $accountId} },
          limit: 1
        ) { ${USER_REWARD_STATE_FIELDS} }
      }`,
      variables: { accountId },
    });
    return res.data?.userRewardState?.[0] ?? null;
  }

  /**
   * Top earners by `total_earned`, descending. Useful for leaderboards.
   *
   * ```ts
   * const top = await os.query.rewards.topEarners({ limit: 10 });
   * ```
   */
  async topEarners(
    opts: { limit?: number; offset?: number } = {}
  ): Promise<UserRewardStateRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      userRewardState: UserRewardStateRow[];
    }>({
      query: `query TopEarners($limit: Int!, $offset: Int!) {
        userRewardState(
          limit: $limit,
          offset: $offset,
          orderBy: [{totalEarned: DESC}]
        ) { ${USER_REWARD_STATE_FIELDS} }
      }`,
      variables: { limit, offset },
    });
    return res.data?.userRewardState ?? [];
  }

  /**
   * Recent successful credits across the protocol, newest first. Optionally
   * narrow to a single app.
   */
  async recentCredits(
    opts: { appId?: string; limit?: number } = {}
  ): Promise<RewardsEventRow[]> {
    return this.events({
      eventType: REWARDS_EVENT_TYPES.REWARD_CREDITED,
      appId: opts.appId,
      limit: opts.limit,
    });
  }

  /** Recent successful claims across the protocol, newest first. */
  async recentClaims(
    opts: { limit?: number } = {}
  ): Promise<RewardsEventRow[]> {
    return this.events({
      eventType: REWARDS_EVENT_TYPES.REWARD_CLAIMED,
      limit: opts.limit,
    });
  }

  /**
   * Credits received by a single account, newest first.
   *
   * ```ts
   * const earned = await os.query.rewards.creditsTo('alice.near');
   * ```
   */
  async creditsTo(
    accountId: string,
    opts: { appId?: string; limit?: number; offset?: number } = {}
  ): Promise<RewardsEventRow[]> {
    return this.events({
      accountId,
      appId: opts.appId,
      eventType: REWARDS_EVENT_TYPES.REWARD_CREDITED,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  /**
   * Credits issued by a specific caller (owner, executor, or authorized app
   * caller), newest first.
   */
  async creditsBy(
    creditedBy: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<RewardsEventRow[]> {
    return this.events({
      creditedBy,
      eventType: REWARDS_EVENT_TYPES.REWARD_CREDITED,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  /** Claims made by a single account, newest first. */
  async claimsBy(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<RewardsEventRow[]> {
    return this.events({
      accountId,
      eventType: REWARDS_EVENT_TYPES.REWARD_CLAIMED,
      limit: opts.limit,
    });
  }

  /**
   * Activity feed for a single app — credits issued under that `appId`,
   * newest first. Apps without budgets fall under the `'global'` synthetic
   * id (the contract emits this when no `app_id` is passed).
   *
   * ```ts
   * const feed = await os.query.rewards.appActivity('chat');
   * ```
   */
  async appActivity(
    appId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<RewardsEventRow[]> {
    return this.events({
      appId,
      eventType: REWARDS_EVENT_TYPES.REWARD_CREDITED,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  /**
   * Pool deposits (FT transfers into the rewards contract), newest first.
   * Useful for treasury monitoring.
   */
  async poolDeposits(
    opts: { limit?: number } = {}
  ): Promise<RewardsEventRow[]> {
    return this.events({
      eventType: REWARDS_EVENT_TYPES.POOL_DEPOSIT,
      limit: opts.limit,
    });
  }
}
