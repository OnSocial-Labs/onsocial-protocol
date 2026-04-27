// ---------------------------------------------------------------------------
// Token event queries (NEP-141 mint / burn / transfer history).
// Accessed as `os.query.token.<method>()`.
//
// Backed by two tables populated by the token substreams indexer:
//   - `token_events`   — full event stream (ft_mint, ft_burn, ft_transfer).
//   - `token_balances` — per-account "last seen" snapshot (NOT a balance —
//                        Hasura sees only event activity; for the actual
//                        on-chain balance call `ft_balance_of` via RPC).
//
// For the live balance of an account, query the token contract directly
// (`token.ft_balance_of({account_id})`). Use this namespace when you need
// historical activity, transfer feeds, or activity-based leaderboards.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/**
 * A single row from `token_events`. Sparse columns are populated only for
 * the relevant `eventType` — branch on it when reading.
 */
export interface TokenEventRow {
  /** Unique receipt-derived id. */
  id: string;
  /** Lowercase event tag — see {@link TOKEN_EVENT_TYPES}. */
  eventType: string;
  blockHeight: number;
  blockTimestamp: number;
  receiptId: string;

  // ── Mint / burn fields ─────────────────────────────────────────────────
  /** Recipient on mint, holder on burn. Null for transfers. */
  ownerId: string | null;
  /** yoctoSOCIAL string. */
  amount: string | null;
  /** Optional caller-supplied memo. */
  memo: string | null;

  // ── Transfer fields ────────────────────────────────────────────────────
  /** Sender on transfer. Null for mint/burn. */
  oldOwnerId: string | null;
  /** Receiver on transfer. Null for mint/burn. */
  newOwnerId: string | null;

  /** Full JSON catch-all for forward-compat. */
  extraData: string | null;
}

/** A single row from `token_balances` — last-seen activity per account. */
export interface TokenAccountActivityRow {
  accountId: string;
  /** Last event the account participated in (mint / burn / transfer). */
  lastEventType: string | null;
  lastEventBlock: number;
  /** Last update timestamp (ns since epoch). */
  updatedAt: number;
}

const TOKEN_EVENT_FIELDS = `
  id
  eventType
  blockHeight
  blockTimestamp
  receiptId
  ownerId
  amount
  memo
  oldOwnerId
  newOwnerId
  extraData
`;

const TOKEN_BALANCE_FIELDS = `
  accountId
  lastEventType
  lastEventBlock
  updatedAt
`;

/**
 * Literal `event_type` strings emitted by the token contract. Exported for
 * callers that want to filter via {@link TokenQuery.events} or
 * `os.query.graphql`.
 */
export const TOKEN_EVENT_TYPES = {
  FT_MINT: 'ft_mint',
  FT_BURN: 'ft_burn',
  FT_TRANSFER: 'ft_transfer',
} as const;

export class TokenQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Generic event filter — every other helper in this namespace is a thin
   * specialization of this. Filters are AND-ed together; pass arrays to
   * `eventType` for `_in` matching.
   *
   * Note: `accountId` matches `owner_id` only (mint/burn). To find every
   * event involving an account (including transfers), use
   * {@link TokenQuery.activity}.
   */
  async events(
    opts: {
      eventType?: string | string[];
      accountId?: string;
      oldOwnerId?: string;
      newOwnerId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<TokenEventRow[]> {
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
      addEq('ownerId', 'accountId', opts.accountId, 'String!');
    if (opts.oldOwnerId)
      addEq('oldOwnerId', 'oldOwnerId', opts.oldOwnerId, 'String!');
    if (opts.newOwnerId)
      addEq('newOwnerId', 'newOwnerId', opts.newOwnerId, 'String!');

    const whereClause = wheres.length ? `where: { ${wheres.join(', ')} },` : '';
    const res = await this._q.graphql<{
      tokenEvents: TokenEventRow[];
    }>({
      query: `query TokenEvents(${params.join(', ')}) {
        tokenEvents(
          ${whereClause}
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${TOKEN_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.tokenEvents ?? [];
  }

  /**
   * Full activity feed for one account — every event where the account
   * appears as `owner_id`, `old_owner_id`, OR `new_owner_id`. Newest first.
   */
  async activity(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<TokenEventRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      tokenEvents: TokenEventRow[];
    }>({
      query: `query TokenAccountActivity($accountId: String!, $limit: Int!, $offset: Int!) {
        tokenEvents(
          where: { _or: [
            {ownerId: {_eq: $accountId}},
            {oldOwnerId: {_eq: $accountId}},
            {newOwnerId: {_eq: $accountId}}
          ] },
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${TOKEN_EVENT_FIELDS} }
      }`,
      variables: { accountId, limit, offset },
    });
    return res.data?.tokenEvents ?? [];
  }

  /** Last-seen activity row for a single account, or `null` if never seen. */
  async lastSeen(accountId: string): Promise<TokenAccountActivityRow | null> {
    const res = await this._q.graphql<{
      tokenBalances: TokenAccountActivityRow[];
    }>({
      query: `query TokenAccountLastSeen($accountId: String!) {
        tokenBalances(
          where: { accountId: {_eq: $accountId} },
          limit: 1
        ) { ${TOKEN_BALANCE_FIELDS} }
      }`,
      variables: { accountId },
    });
    return res.data?.tokenBalances?.[0] ?? null;
  }

  /** Most recently active accounts, newest first. */
  async mostActiveAccounts(
    opts: { limit?: number; offset?: number } = {}
  ): Promise<TokenAccountActivityRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      tokenBalances: TokenAccountActivityRow[];
    }>({
      query: `query TokenMostActive($limit: Int!, $offset: Int!) {
        tokenBalances(
          limit: $limit,
          offset: $offset,
          orderBy: [{lastEventBlock: DESC}]
        ) { ${TOKEN_BALANCE_FIELDS} }
      }`,
      variables: { limit, offset },
    });
    return res.data?.tokenBalances ?? [];
  }

  /** Recent transfers across the protocol, newest first. */
  async recentTransfers(
    opts: { limit?: number } = {}
  ): Promise<TokenEventRow[]> {
    return this.events({
      eventType: TOKEN_EVENT_TYPES.FT_TRANSFER,
      limit: opts.limit,
    });
  }

  /** Recent mints, newest first. */
  async recentMints(opts: { limit?: number } = {}): Promise<TokenEventRow[]> {
    return this.events({
      eventType: TOKEN_EVENT_TYPES.FT_MINT,
      limit: opts.limit,
    });
  }

  /** Recent burns, newest first. */
  async recentBurns(opts: { limit?: number } = {}): Promise<TokenEventRow[]> {
    return this.events({
      eventType: TOKEN_EVENT_TYPES.FT_BURN,
      limit: opts.limit,
    });
  }

  /** Transfers sent by an account, newest first. */
  async transfersFrom(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<TokenEventRow[]> {
    return this.events({
      oldOwnerId: accountId,
      eventType: TOKEN_EVENT_TYPES.FT_TRANSFER,
      limit: opts.limit,
      offset: opts.offset,
    });
  }

  /** Transfers received by an account, newest first. */
  async transfersTo(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<TokenEventRow[]> {
    return this.events({
      newOwnerId: accountId,
      eventType: TOKEN_EVENT_TYPES.FT_TRANSFER,
      limit: opts.limit,
      offset: opts.offset,
    });
  }
}
