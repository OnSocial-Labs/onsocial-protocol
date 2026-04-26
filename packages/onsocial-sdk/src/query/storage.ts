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
   * Tips sent by an account (operation = "tip", actorId = sender).
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
          where: { operation: {_eq: "tip"}, actorId: {_eq: $id} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${STORAGE_EVENT_FIELDS} }
      }`,
      variables: { id: senderId, limit: opts.limit ?? 50 },
    });
    return res.data?.storageUpdates ?? [];
  }

  /**
   * Tips received by an account (operation = "tip", targetId = recipient).
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
          where: { operation: {_eq: "tip"}, targetId: {_eq: $id} },
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
   * const recent = await os.query.storage.byOperation('tip', { limit: 25 });
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
}
