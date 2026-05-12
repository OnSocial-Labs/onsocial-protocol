// ---------------------------------------------------------------------------
// Auctions — start, placeBid, settle, cancel.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { AuctionOptions, RelayResponse } from '../../types.js';
import {
  composeAndSign,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';

export class ScarcesAuctionsApi {
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
   * Start an auction for a scarce (corresponds to the contract's
   * `list_auction` action).
   *
   * ```ts
   * await os.scarces.auctions.start({
   *   tokenId: '1',
   *   reservePriceNear: '1',
   *   minBidIncrementNear: '0.1',
   * });
   * ```
   */
  async start(opts: AuctionOptions): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.LIST_AUCTION,
      opts,
      'scarces.listAuction',
      this._broadcastOpts()
    );
  }

  /** Place a bid on an auction. */
  async placeBid(tokenId: string, amountNear: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.PLACE_BID,
      {
        tokenId,
        amountNear,
      },
      'scarces.placeBid',
      this._broadcastOpts()
    );
  }

  /** Settle a completed auction. */
  async settle(tokenId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SETTLE_AUCTION,
      {
        tokenId,
      },
      'scarces.settleAuction',
      this._broadcastOpts()
    );
  }

  /** Cancel an auction. */
  async cancel(tokenId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CANCEL_AUCTION,
      {
        tokenId,
      },
      'scarces.cancelAuction',
      this._broadcastOpts()
    );
  }
}
