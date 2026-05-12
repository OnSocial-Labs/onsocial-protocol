// ---------------------------------------------------------------------------
// Marketplace — fixed-price `sell` / `delist` / `purchase`.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { ListingOptions, RelayResponse } from '../../types.js';
import {
  composeAndSign,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';

export class ScarcesMarketApi {
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
   * List a scarce for fixed-price sale (corresponds to the contract's
   * `list_native_scarce` action).
   *
   * ```ts
   * await os.scarces.market.sell({ tokenId: '1', priceNear: '5' });
   * ```
   */
  async sell(opts: ListingOptions): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.LIST_NATIVE_SCARCE,
      opts,
      'scarces.listNativeScarce',
      this._broadcastOpts()
    );
  }

  /** Delist a scarce from sale. */
  async delist(tokenId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.DELIST_NATIVE_SCARCE,
      {
        tokenId,
      },
      'scarces.delistNativeScarce',
      this._broadcastOpts()
    );
  }

  /** Purchase a listed scarce at its asking price. */
  async purchase(tokenId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.PURCHASE_NATIVE_SCARCE,
      {
        tokenId,
      },
      'scarces.purchaseNativeScarce',
      this._broadcastOpts()
    );
  }

  /** Update the asking price of an external (cross-contract) listing. */
  async updateSalePrice(
    scarceContractId: string,
    tokenId: string,
    priceNear: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UPDATE_SALE_PRICE,
      {
        scarceContractId,
        tokenId,
        priceNear,
      },
      'scarces.updateSalePrice',
      this._broadcastOpts()
    );
  }

  /** Delist an external (cross-contract) scarce listing. */
  async delistExternal(
    scarceContractId: string,
    tokenId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.DELIST_EXTERNAL_SCARCE,
      {
        scarceContractId,
        tokenId,
      },
      'scarces.delistExternalScarce',
      this._broadcastOpts()
    );
  }
}
