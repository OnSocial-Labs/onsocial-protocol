// ---------------------------------------------------------------------------
// Offers — token-level + collection-level make / cancel / accept.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type {
  CollectionOfferOptions,
  OfferOptions,
  RelayResponse,
} from '../../types.js';
import {
  composeAndSign,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';

export class ScarcesOffersApi {
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

  /** Make an offer on a specific scarce. */
  async make(opts: OfferOptions): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.MAKE_OFFER,
      opts,
      'scarces.makeOffer',
      this._broadcastOpts()
    );
  }

  /** Cancel an offer. */
  async cancel(tokenId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CANCEL_OFFER,
      {
        tokenId,
      },
      'scarces.cancelOffer',
      this._broadcastOpts()
    );
  }

  /** Accept an offer on a scarce you own. */
  async accept(tokenId: string, buyerId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.ACCEPT_OFFER,
      {
        tokenId,
        buyerId,
      },
      'scarces.acceptOffer',
      this._broadcastOpts()
    );
  }

  /** Make an offer on an entire collection. */
  async makeCollection(opts: CollectionOfferOptions): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.MAKE_COLLECTION_OFFER,
      opts,
      'scarces.makeCollectionOffer',
      this._broadcastOpts()
    );
  }

  /** Cancel a collection offer. */
  async cancelCollection(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CANCEL_COLLECTION_OFFER,
      {
        collectionId,
      },
      'scarces.cancelCollectionOffer',
      this._broadcastOpts()
    );
  }

  /** Accept a collection offer (pick which token in the collection fills it). */
  async acceptCollection(
    collectionId: string,
    tokenId: string,
    buyerId: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.ACCEPT_COLLECTION_OFFER,
      {
        collectionId,
        tokenId,
        buyerId,
      },
      'scarces.acceptCollectionOffer',
      this._broadcastOpts()
    );
  }
}
