// ---------------------------------------------------------------------------
// Storage event queries.
// Accessed as `os.query.storage.<method>()`.
//
// Backed by the `storage_updates` table populated by substreams. Returns
// historical balance/tip/sponsor/withdraw events emitted by the core
// contract.  For *current* on-chain balances use `os.storageAccount.*`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/** A single storage event as recorded by the indexer. */
export interface StorageEventRow {
  operation: string;
  actorId: string;
  targetId: string;
  amount: string;
  blockHeight: number;
  blockTimestamp: number;
  groupId: string | null;
  poolId: string | null;
  reason: string | null;
}

/** Share-allocation event emitted when a pool owner sponsors a target. */
export interface StorageShareGrantEventRow {
  targetId: string;
  maxBytes: string;
  blockHeight: number;
}

/**
 * Group sponsor quota override event (`GROUP_UPDATE` /
 * `group_sponsor_quota_set`). Live allowance still lives on-chain; pair with
 * the latest enabled event per member for an active-grants list.
 */
export interface GroupSponsorQuotaEventRow {
  memberId: string;
  quotaBytes: string;
  dailyLimit: string;
  previouslyEnabled: boolean;
  extraData: string | null;
  blockHeight: number;
}

/** Group default sponsor policy event (`group_sponsor_default_set`). */
export interface GroupSponsorDefaultEventRow {
  quotaBytes: string;
  dailyLimit: string;
  previouslyEnabled: boolean;
  extraData: string | null;
  blockHeight: number;
}

/**
 * Group sponsor spend (`STORAGE_UPDATE` / `group_sponsor_spend`).
 * Latest row per payer gives remaining allowance after that write.
 */
export interface GroupSponsorSpendEventRow {
  payer: string;
  bytes: string;
  remainingAllowance: string;
  blockHeight: number;
}

const STORAGE_EVENT_FIELDS = `
  operation
  actorId
  targetId
  amount
  blockHeight
  blockTimestamp
  groupId
  poolId
  reason
`;

export class StorageQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Tips sent by an account (operation = "storage_tip", actorId = sender).
   *
   * ```ts
   * const sent = await os.query.storage.tipsSent('alice.near', { limit: 20 });
   * ```
   */
  async tipsSent(
    senderId: string,
    opts: { limit?: number } = {}
  ): Promise<StorageEventRow[]> {
    const res = await this._q.graphql<{ storageUpdates: StorageEventRow[] }>({
      query: `query TipsSent($id: String!, $limit: Int!) {
        storageUpdates(
          where: { operation: {_eq: "storage_tip"}, actorId: {_eq: $id} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${STORAGE_EVENT_FIELDS} }
      }`,
      variables: { id: senderId, limit: opts.limit ?? 50 },
    });
    return res.data?.storageUpdates ?? [];
  }

  /**
   * Tips received by an account (operation = "storage_tip", targetId = recipient).
   *
   * ```ts
   * const received = await os.query.storage.tipsReceived('bob.near');
   * ```
   */
  async tipsReceived(
    recipientId: string,
    opts: { limit?: number } = {}
  ): Promise<StorageEventRow[]> {
    const res = await this._q.graphql<{ storageUpdates: StorageEventRow[] }>({
      query: `query TipsReceived($id: String!, $limit: Int!) {
        storageUpdates(
          where: { operation: {_eq: "storage_tip"}, targetId: {_eq: $id} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${STORAGE_EVENT_FIELDS} }
      }`,
      variables: { id: recipientId, limit: opts.limit ?? 50 },
    });
    return res.data?.storageUpdates ?? [];
  }

  /**
   * Full storage event history for an account — events where the account is
   * either the actor (e.g. tip/withdraw/deposit sender) or the target
   * (e.g. tip/sponsor recipient).
   *
   * ```ts
   * const events = await os.query.storage.history('alice.near', { limit: 100 });
   * ```
   */
  async history(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<StorageEventRow[]> {
    const res = await this._q.graphql<{ storageUpdates: StorageEventRow[] }>({
      query: `query StorageHistory($id: String!, $limit: Int!) {
        storageUpdates(
          where: {
            _or: [
              { actorId: {_eq: $id} },
              { targetId: {_eq: $id} }
            ]
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${STORAGE_EVENT_FIELDS} }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
    return res.data?.storageUpdates ?? [];
  }

  /**
   * Recent events of a specific operation type across all accounts.
   * Useful for activity feeds (e.g. "recent tips on the network").
   *
   * ```ts
   * const recent = await os.query.storage.byOperation('storage_tip', { limit: 25 });
   * ```
   */
  async byOperation(
    operation: string,
    opts: { limit?: number } = {}
  ): Promise<StorageEventRow[]> {
    const res = await this._q.graphql<{ storageUpdates: StorageEventRow[] }>({
      query: `query StorageByOperation($op: String!, $limit: Int!) {
        storageUpdates(
          where: { operation: {_eq: $op} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${STORAGE_EVENT_FIELDS} }
      }`,
      variables: { op: operation, limit: opts.limit ?? 50 },
    });
    return res.data?.storageUpdates ?? [];
  }

  /**
   * Share-storage grants issued by a pool owner (operation = "share_storage",
   * author = pool owner). Returns historical grant events; pair with live
   * `storageAccount.sponsorshipReceived(target)` to see active allocations.
   */
  async sharesGranted(
    poolOwnerId: string,
    opts: { limit?: number } = {}
  ): Promise<StorageShareGrantEventRow[]> {
    const res = await this._q.graphql<{
      storageUpdates: StorageShareGrantEventRow[];
    }>({
      query: `query SharesGranted($id: String!, $limit: Int!) {
        storageUpdates(
          where: { operation: {_eq: "share_storage"}, author: {_eq: $id} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { targetId maxBytes blockHeight }
      }`,
      variables: { id: poolOwnerId, limit: opts.limit ?? 100 },
    });
    return res.data?.storageUpdates ?? [];
  }

  /**
   * Per-member group sponsor quota sets for a guild (operation =
   * `group_sponsor_quota_set` on `groupUpdates`). Newest first.
   */
  async groupSponsorQuotasGranted(
    groupId: string,
    opts: { limit?: number } = {}
  ): Promise<GroupSponsorQuotaEventRow[]> {
    const res = await this._q.graphql<{
      groupUpdates: GroupSponsorQuotaEventRow[];
    }>({
      query: `query GroupSponsorQuotasGranted($groupId: String!, $limit: Int!) {
        groupUpdates(
          where: {
            operation: {_eq: "group_sponsor_quota_set"},
            groupId: {_eq: $groupId}
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) {
          memberId
          quotaBytes
          dailyLimit
          previouslyEnabled
          extraData
          blockHeight
        }
      }`,
      variables: { groupId, limit: opts.limit ?? 100 },
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Default group sponsor policy events (operation =
   * `group_sponsor_default_set`). Newest first — take `[0]` for current.
   */
  async groupSponsorDefaults(
    groupId: string,
    opts: { limit?: number } = {}
  ): Promise<GroupSponsorDefaultEventRow[]> {
    const res = await this._q.graphql<{
      groupUpdates: GroupSponsorDefaultEventRow[];
    }>({
      query: `query GroupSponsorDefaults($groupId: String!, $limit: Int!) {
        groupUpdates(
          where: {
            operation: {_eq: "group_sponsor_default_set"},
            groupId: {_eq: $groupId}
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) {
          quotaBytes
          dailyLimit
          previouslyEnabled
          extraData
          blockHeight
        }
      }`,
      variables: { groupId, limit: opts.limit ?? 20 },
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Group sponsor spend events for a guild (operation =
   * `group_sponsor_spend` on `storageUpdates`). Newest first — take the
   * latest row per `payer` for remaining allowance.
   */
  async groupSponsorSpends(
    groupId: string,
    opts: { limit?: number } = {}
  ): Promise<GroupSponsorSpendEventRow[]> {
    const res = await this._q.graphql<{
      storageUpdates: GroupSponsorSpendEventRow[];
    }>({
      query: `query GroupSponsorSpends($groupId: String!, $limit: Int!) {
        storageUpdates(
          where: {
            operation: {_eq: "group_sponsor_spend"},
            groupId: {_eq: $groupId}
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) {
          payer
          bytes
          remainingAllowance
          blockHeight
        }
      }`,
      variables: { groupId, limit: opts.limit ?? 200 },
    });
    return res.data?.storageUpdates ?? [];
  }
}
