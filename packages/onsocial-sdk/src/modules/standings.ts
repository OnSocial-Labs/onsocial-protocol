// ---------------------------------------------------------------------------
// OnSocial SDK — standings module
//
// The blessed entry point for the standing graph (account ↔ account
// "I stand with you" edges). Wraps `os.social.standWith` / `unstand`
// and the `os.query.standings.incoming` / `outgoing` / `counts`
// reads behind a consistent verb set:
//
//   await os.standings.add('bob.near')
//   await os.standings.remove('bob.near')
//   const { applied } = await os.standings.toggle('bob.near')
//   const has = await os.standings.has('alice.near', 'bob.near')
//   const list = await os.standings.listOutgoing('alice.near')
//   const list = await os.standings.listIncoming('alice.near')
//   const { incoming, outgoing } = await os.standings.counts('alice.near')
// ---------------------------------------------------------------------------

import type { SocialModule } from './social.js';
import type { QueryModule } from '../query/index.js';
import type { StandingListItem } from '../query/standings.js';
import type { RelayResponse } from '../types.js';

/**
 * Standings — "I stand with you" relationship edges.
 *
 * @throws {SessionRequiredError} On writes when no session is attached and broadcast is not `'wallet'`.
 */
export class StandingsModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule
  ) {}

  /**
   * Stand with another account. Idempotent — re-adding refreshes the
   * `since` timestamp on the existing record.
   *
   * ```ts
   * await os.standings.add('bob.near');
   * ```
   */
  add(
    targetAccount: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return opts
      ? this._social.standWith(targetAccount, opts)
      : this._social.standWith(targetAccount);
  }

  /** Remove a standing. */
  remove(
    targetAccount: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return opts
      ? this._social.unstand(targetAccount, opts)
      : this._social.unstand(targetAccount);
  }

  /**
   * True if `viewer` currently stands with `targetAccount`.
   * `viewer` defaults to checking the outbound edges of `targetAccount`'s
   * standers — pass it explicitly for a "does Alice stand with Bob?" check.
   */
  async has(viewer: string, targetAccount: string): Promise<boolean> {
    const out = await this.listOutgoing(viewer);
    return out.includes(targetAccount);
  }

  /**
   * Toggle a standing edge from the JWT identity to `targetAccount`.
   * Reads the caller's outbound edges to decide direction.
   *
   * ```ts
   * const { applied } = await os.standings.toggle('bob.near', { viewer: 'alice.near' });
   * setStanding(applied);
   * ```
   */
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

  /**
   * Accounts that `accountId` stands with (outbound edges).
   *
   * ```ts
   * const out = await os.standings.listOutgoing('alice.near');
   * ```
   */
  listOutgoing(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<string[]> {
    return this._query.standings.outgoing(accountId, opts);
  }

  listOutgoingDetailed(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<StandingListItem[]> {
    return this._query.standings.outgoingDetailed(accountId, opts);
  }

  /**
   * Accounts that stand with `accountId` (inbound edges).
   *
   * ```ts
   * const standers = await os.standings.listIncoming('alice.near');
   * ```
   */
  listIncoming(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<string[]> {
    return this._query.standings.incoming(accountId, opts);
  }

  listIncomingDetailed(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<StandingListItem[]> {
    return this._query.standings.incomingDetailed(accountId, opts);
  }

  /**
   * Standing counts for an account (inbound + outbound).
   *
   * ```ts
   * const { incoming, outgoing } = await os.standings.counts('alice.near');
   * ```
   */
  counts(accountId: string): Promise<{ incoming: number; outgoing: number }> {
    return this._query.standings.counts(accountId);
  }
}
