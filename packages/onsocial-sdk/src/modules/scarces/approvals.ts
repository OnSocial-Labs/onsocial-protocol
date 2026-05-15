// ---------------------------------------------------------------------------
// Approvals — NEP-178 approve / revoke a specific approval / revoke all.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { RelayResponse } from '../../types.js';
import {
  composeAndSign,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';
import { scarcesRelayOptions } from './_relay.js';

export class ScarcesApprovalsApi {
  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _getBroadcast?: BroadcastGetter
  ) {}

  private _relayOpts(opts?: { confirmation?: boolean }) {
    return scarcesRelayOptions(this._getBroadcast, opts);
  }

  /**
   * Approve `accountId` to operate on `tokenId`. Optional `msg` is forwarded
   * to the approver via cross-contract call (NEP-178).
   *
   * ```ts
   * await os.scarces.approvals.approve('s:42', 'market.example.near');
   * ```
   */
  async approve(
    tokenId: string,
    accountId: string,
    msg?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.APPROVE,
      { tokenId, accountId, ...(msg !== undefined ? { msg } : {}) },
      'scarces.approve',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Revoke a single approval previously granted to `accountId`. */
  async revoke(tokenId: string, accountId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REVOKE_APPROVAL,
      { tokenId, accountId },
      'scarces.revokeApproval',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Revoke every approval on `tokenId`. */
  async revokeAll(tokenId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REVOKE_ALL_APPROVALS,
      { tokenId },
      'scarces.revokeAllApprovals',
      this._relayOpts({ confirmation: true })
    );
  }
}
