// ---------------------------------------------------------------------------
// OnSocial SDK — scarces module (NFTs).
//
// Sub-namespaces:
//   • `os.scarces.tokens`       — mint / transfer / batchTransfer / burn
//   • `os.scarces.collections`  — create / mintFrom / purchaseFrom / airdrop /
//                                 pause / resume / delete
//   • `os.scarces.market`       — sell / delist / purchase  (fixed-price)
//   • `os.scarces.auctions`     — start / placeBid / settle / cancel
//   • `os.scarces.offers`       — make / cancel / accept / makeCollection /
//                                 cancelCollection / acceptCollection
//   • `os.scarces.lazy`         — create / purchase  (mint-on-purchase)
//   • `os.scarces.fromPost`     — mint / list  (turn a post into a scarce)
//
// When the OnSocial client has a `StorageProvider` configured (e.g. Lighthouse),
// file-bearing methods (`tokens.mint`, `collections.create`, `lazy.create`)
// upload locally and submit the resulting action through `/relay/execute`.
// Otherwise they fall through to the gateway's `/compose/<verb>` endpoint
// (zero-config — the gateway uploads via its own Lighthouse account).
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { SocialModule } from '../../social.js';
import { ScarcesTokensApi } from './tokens.js';
import { ScarcesCollectionsApi } from './collections.js';
import { ScarcesMarketApi } from './market.js';
import { ScarcesAuctionsApi } from './auctions.js';
import { ScarcesOffersApi } from './offers.js';
import { ScarcesLazyApi } from './lazy.js';
import { ScarcesFromPostApi } from './from-post.js';

export class ScarcesModule {
  readonly tokens: ScarcesTokensApi;
  readonly collections: ScarcesCollectionsApi;
  readonly market: ScarcesMarketApi;
  readonly auctions: ScarcesAuctionsApi;
  readonly offers: ScarcesOffersApi;
  readonly lazy: ScarcesLazyApi;
  readonly fromPost: ScarcesFromPostApi;

  constructor(
    http: HttpClient,
    social?: SocialModule,
    storage?: StorageProvider
  ) {
    this.tokens = new ScarcesTokensApi(http, storage);
    this.collections = new ScarcesCollectionsApi(http, storage);
    this.market = new ScarcesMarketApi(http);
    this.auctions = new ScarcesAuctionsApi(http);
    this.offers = new ScarcesOffersApi(http);
    this.lazy = new ScarcesLazyApi(http, storage);
    this.fromPost = new ScarcesFromPostApi(this.tokens, this.lazy, social);
  }
}

export { ScarcesTokensApi } from './tokens.js';
export { ScarcesCollectionsApi } from './collections.js';
export { ScarcesMarketApi } from './market.js';
export { ScarcesAuctionsApi } from './auctions.js';
export { ScarcesOffersApi } from './offers.js';
export { ScarcesLazyApi } from './lazy.js';
export { ScarcesFromPostApi } from './from-post.js';
