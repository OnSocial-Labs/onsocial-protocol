// ---------------------------------------------------------------------------
// Auctions — start, placeBid, settle, cancel.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { AuctionOptions, RelayResponse } from '../../types.js';

export class ScarcesAuctionsApi {
  constructor(private _http: HttpClient) {}

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
    return this._http.post<RelayResponse>('/compose/list-auction', opts);
  }

  /** Place a bid on an auction. */
  async placeBid(
    tokenId: string,
    amountNear: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/place-bid', {
      tokenId,
      amountNear,
    });
  }

  /** Settle a completed auction. */
  async settle(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/settle-auction', {
      tokenId,
    });
  }

  /** Cancel an auction. */
  async cancel(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-auction', {
      tokenId,
    });
  }
}
