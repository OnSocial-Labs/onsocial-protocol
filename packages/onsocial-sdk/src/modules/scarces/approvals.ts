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

export class ScarcesApprovalsApi {
  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _getBroadcast?: BroadcastGetter
  ) {}

  private _broadcastOpts():
    | { broadcast: ReturnType<BroadcastGetter> }
    | undefined {
    const b = this._getBroadcast?.();
    return b !== undefined ? { broadcast: b } : undefined;
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
      this._broadcastOpts()
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
      this._broadcastOpts()
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
      this._broadcastOpts()
    );
  }
}
