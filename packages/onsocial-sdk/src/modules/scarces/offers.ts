// ---------------------------------------------------------------------------
// Offers — token-level + collection-level make / cancel / accept.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type {
  CollectionOfferOptions,
  OfferOptions,
  RelayResponse,
} from '../../types.js';

export class ScarcesOffersApi {
  constructor(private _http: HttpClient) {}

  /** Make an offer on a specific scarce. */
  async make(opts: OfferOptions): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/make-offer', opts);
  }

  /** Cancel an offer. */
  async cancel(tokenId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-offer', {
      tokenId,
    });
  }

  /** Accept an offer on a scarce you own. */
  async accept(tokenId: string, buyerId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/accept-offer', {
      tokenId,
      buyerId,
    });
  }

  /** Make an offer on an entire collection. */
  async makeCollection(
    opts: CollectionOfferOptions
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>(
      '/compose/make-collection-offer',
      opts
    );
  }

  /** Cancel a collection offer. */
  async cancelCollection(collectionId: string): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/cancel-collection-offer', {
      collectionId,
    });
  }

  /** Accept a collection offer (pick which token in the collection fills it). */
  async acceptCollection(
    collectionId: string,
    tokenId: string,
    buyerId: string
  ): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/accept-collection-offer', {
      collectionId,
      tokenId,
      buyerId,
    });
  }
}
