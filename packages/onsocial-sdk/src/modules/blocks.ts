// ---------------------------------------------------------------------------
// OnSocial SDK — blocks module
//
// Hard account blocks (on-chain edges under `block/<target>`).
//
//   await os.blocks.add('bob.near')
//   await os.blocks.remove('bob.near')
//   const { applied } = await os.blocks.toggle('bob.near', { viewer: 'alice.near' })
//   const has = await os.blocks.has('alice.near', 'bob.near')
//   const list = await os.blocks.listOutgoing('alice.near')
// ---------------------------------------------------------------------------

import type { SocialModule } from './social.js';
import type { QueryModule } from '../query/index.js';
import type { BlockListItem } from '../query/blocks.js';
import type { RelayResponse } from '../types.js';

/**
 * Blocks — hard account relationship edges.
 *
 * @throws {SessionRequiredError} On writes when no session is attached and broadcast is not `'wallet'`.
 */
export class BlocksModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule
  ) {}

  /**
   * Block another account. Idempotent — re-blocking refreshes `since`.
   */
  add(
    targetAccount: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return opts
      ? this._social.blockAccount(targetAccount, opts)
      : this._social.blockAccount(targetAccount);
  }

  /** Remove a block. */
  remove(
    targetAccount: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return opts
      ? this._social.unblockAccount(targetAccount, opts)
      : this._social.unblockAccount(targetAccount);
  }

  /** True if `viewer` currently blocks `targetAccount`. */
  async has(viewer: string, targetAccount: string): Promise<boolean> {
    return this._query.blocks.viewerBlocks(viewer, targetAccount);
  }

  async toggle(
    targetAccount: string,
    opts: { viewer: string; wait?: boolean }
  ): Promise<{ response: RelayResponse; applied: boolean }> {
    const exists = await this.has(opts.viewer, targetAccount);
    const waitOpts = opts.wait != null ? { wait: opts.wait } : undefined;
    if (exists) {
      const response = await this.remove(targetAccount, waitOpts);
      return { response, applied: false };
    }
    const response = await this.add(targetAccount, waitOpts);
    return { response, applied: true };
  }

  listOutgoing(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<string[]> {
    return this._query.blocks.outgoing(accountId, opts);
  }

  listOutgoingDetailed(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<BlockListItem[]> {
    return this._query.blocks.outgoingDetailed(accountId, opts);
  }

  listIncoming(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<string[]> {
    return this._query.blocks.incoming(accountId, opts);
  }

  listIncomingDetailed(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<BlockListItem[]> {
    return this._query.blocks.incomingDetailed(accountId, opts);
  }

  viewerBlocks(
    viewerAccountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    return this._query.blocks.viewerBlocks(viewerAccountId, targetAccountId);
  }

  eitherWay(
    viewerAccountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    return this._query.blocks.eitherWay(viewerAccountId, targetAccountId);
  }
}
