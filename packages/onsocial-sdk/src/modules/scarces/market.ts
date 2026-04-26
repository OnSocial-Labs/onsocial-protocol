// ---------------------------------------------------------------------------
// Marketplace — fixed-price `sell` / `delist` / `purchase`.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { ListingOptions, RelayResponse } from '../../types.js';

export class ScarcesMarketApi {
  constructor(private _http: HttpClient) {}

  /**
   * List a scarce for fixed-price sale (corresponds to the contract's
   * `list_native_scarce` action).
   *
   * ```ts
   * await os.scarces.market.sell({ tokenId: '1', priceNear: '5' });
   * ```
   */
  async sell(opts: ListingOptions): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/list-native-scarce', opts);
  }

  /** Delist a scarce from sale. */
  async delist(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/delist-native-scarce', {
      tokenId,
    });
  }

  /** Purchase a listed scarce at its asking price. */
  async purchase(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/purchase-native-scarce', {
      tokenId,
    });
  }

  /** Update the asking price of an external (cross-contract) listing. */
  async updateSalePrice(
    scarceContractId: string,
    tokenId: string,
    priceNear: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/update-sale-price', {
      scarceContractId,
      tokenId,
      priceNear,
    });
  }

  /** Delist an external (cross-contract) scarce listing. */
  async delistExternal(
    scarceContractId: string,
    tokenId: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/delist-external-scarce', {
      scarceContractId,
      tokenId,
    });
  }
}
