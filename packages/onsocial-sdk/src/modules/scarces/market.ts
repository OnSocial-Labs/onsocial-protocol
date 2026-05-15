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
import { scarcesRelayOptions } from './_relay.js';

export class ScarcesMarketApi {
  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _getBroadcast?: BroadcastGetter
  ) {}

  private _relayOpts(opts?: { confirmation?: boolean }) {
    return scarcesRelayOptions(this._getBroadcast, opts);
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
      this._relayOpts()
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts()
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
      this._relayOpts({ confirmation: true })
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
      this._relayOpts({ confirmation: true })
    );
  }
}
