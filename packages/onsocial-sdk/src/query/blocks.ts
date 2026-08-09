// ---------------------------------------------------------------------------
// Block graph queries.
// Accessed as `os.query.blocks.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface BlockListItem {
  accountId: string;
  targetAccount: string;
  since: number | null;
  blockHeight: number;
  blockTimestamp: number;
}

export interface BlockPageOptions {
  limit?: number;
  offset?: number;
}

function parseBlockSince(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { since?: unknown };
    return typeof parsed.since === 'number' ? parsed.since : null;
  } catch {
    return null;
  }
}

export class BlocksQuery {
  constructor(private _q: QueryModule) {}

  async outgoing(
    accountId: string,
    opts: BlockPageOptions = {}
  ): Promise<string[]> {
    const rows = await this.outgoingDetailed(accountId, opts);
    return rows.map((r) => r.targetAccount);
  }

  async outgoingDetailed(
    accountId: string,
    opts: BlockPageOptions = {}
  ): Promise<BlockListItem[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      blocksCurrent: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query BlocksOutgoing($id: String!, $limit: Int!, $offset: Int!) {
        blocksCurrent(
          where: {accountId: {_eq: $id}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockTimestamp: DESC}]
        ) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit, offset },
    });
    return (res.data?.blocksCurrent ?? []).map((r) => ({
      accountId: r.accountId,
      targetAccount: r.targetAccount,
      since: parseBlockSince(r.value),
      blockHeight: Number(r.blockHeight) || 0,
      blockTimestamp: Number(r.blockTimestamp) || 0,
    }));
  }

  async incoming(
    accountId: string,
    opts: BlockPageOptions = {}
  ): Promise<string[]> {
    const rows = await this.incomingDetailed(accountId, opts);
    return rows.map((r) => r.accountId);
  }

  async incomingDetailed(
    accountId: string,
    opts: BlockPageOptions = {}
  ): Promise<BlockListItem[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      blocksCurrent: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query BlocksIncoming($id: String!, $limit: Int!, $offset: Int!) {
        blocksCurrent(
          where: {targetAccount: {_eq: $id}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockTimestamp: DESC}]
        ) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit, offset },
    });
    return (res.data?.blocksCurrent ?? []).map((r) => ({
      accountId: r.accountId,
      targetAccount: r.targetAccount,
      since: parseBlockSince(r.value),
      blockHeight: Number(r.blockHeight) || 0,
      blockTimestamp: Number(r.blockTimestamp) || 0,
    }));
  }

  async viewerBlocks(
    viewerAccountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    const res = await this._q.graphql<{
      blocksCurrent: Array<{ accountId: string }>;
    }>({
      query: `query ViewerBlocks($viewer: String!, $target: String!) {
        blocksCurrent(
          where: {
            accountId: {_eq: $viewer},
            targetAccount: {_eq: $target}
          },
          limit: 1
        ) {
          accountId
        }
      }`,
      variables: { viewer: viewerAccountId, target: targetAccountId },
    });
    return (res.data?.blocksCurrent?.length ?? 0) > 0;
  }

  /** True when either account has a live block edge against the other. */
  async eitherWay(
    viewerAccountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    const res = await this._q.graphql<{
      outgoing: Array<{ accountId: string }>;
      incoming: Array<{ accountId: string }>;
    }>({
      query: `query BlockEitherWay($viewer: String!, $target: String!) {
        outgoing: blocksCurrent(
          where: {
            accountId: {_eq: $viewer},
            targetAccount: {_eq: $target}
          },
          limit: 1
        ) { accountId }
        incoming: blocksCurrent(
          where: {
            accountId: {_eq: $target},
            targetAccount: {_eq: $viewer}
          },
          limit: 1
        ) { accountId }
      }`,
      variables: { viewer: viewerAccountId, target: targetAccountId },
    });
    return (
      (res.data?.outgoing?.length ?? 0) > 0 ||
      (res.data?.incoming?.length ?? 0) > 0
    );
  }
}
