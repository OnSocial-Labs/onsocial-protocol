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
import type {
  StandingListItem,
  StandingListPageOptions,
  StandingListPageResult,
  StandingPeerEnrichment,
  StandingNetworkSampleOptions,
  StandingNetworkSampleResult,
} from '../query/standings.js';
import type {
  ProfileSocialPreviewOptions,
  ProfileSocialPreviewResult,
} from '../query/profiles.js';
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
    return this._query.standings.viewerStandsWith(viewer, targetAccount);
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
    opts: { limit?: number; offset?: number } = {}
  ): Promise<string[]> {
    return this._query.standings.outgoing(accountId, opts);
  }

  listOutgoingDetailed(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
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
    opts: { limit?: number; offset?: number } = {}
  ): Promise<string[]> {
    return this._query.standings.incoming(accountId, opts);
  }

  listIncomingDetailed(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
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

  /** Indexed mutual count (scales; does not scan the graph in app code). */
  mutualCount(accountId: string): Promise<number> {
    return this._query.standings.mutualCount(accountId);
  }

  /** Paginated mutual standing list (`mutual_standings_current`). */
  mutualList(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<StandingListItem[]> {
    return this._query.standings.mutualDetailed(accountId, opts);
  }

  viewerStandsWith(
    viewerAccountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    return this._query.standings.viewerStandsWith(
      viewerAccountId,
      targetAccountId
    );
  }

  /**
   * Profile standing preview — counts, three preview lists, peer profiles, and
   * viewer context in **two** graph round-trips (portal profile modal pattern).
   *
   * ```ts
   * const social = await os.standings.profilePreview({
   *   accountId: 'alice.near',
   *   viewerAccountId: 'bob.near',
   * });
   * ```
   */
  profilePreview(
    opts: ProfileSocialPreviewOptions
  ): Promise<ProfileSocialPreviewResult> {
    return this._query.profiles.socialPreview(opts);
  }

  /**
   * Paginated standing list plus optional tab counts — one graph round-trip.
   * Pair with {@link enrichPeers} for avatars and viewer badges.
   */
  listPage(opts: StandingListPageOptions): Promise<StandingListPageResult> {
    return this._query.standings.listPage(opts);
  }

  /**
   * Batch profile rows + viewer ↔ peer standing context (one round-trip).
   */
  enrichPeers(
    viewerAccountId: string | null | undefined,
    peerAccountIds: string[]
  ): Promise<StandingPeerEnrichment> {
    return this._query.standings.enrichPeers(viewerAccountId, peerAccountIds);
  }

  /**
   * Network map sample — counts, three directional lists, and peer profiles in
   * **two** graph round-trips (portal network graph pattern).
   */
  networkSample(
    opts: StandingNetworkSampleOptions
  ): Promise<StandingNetworkSampleResult> {
    return this._query.standings.networkSample(opts);
  }
}
