// ---------------------------------------------------------------------------
// OnSocial SDK — scarces module (NFTs).
//
// Sub-namespaces:
//   • `os.scarces.tokens`       — mint / transfer / batchTransfer / burn /
//                                 renew / redeem / revoke / claimRefund
//   • `os.scarces.collections`  — create / mintFrom / purchaseFrom / airdrop /
//                                 pause / resume / delete / updatePrice /
//                                 updateTiming / setAllowlist / cancel / …
//   • `os.scarces.market`       — sell / delist / purchase / updateSalePrice /
//                                 delistExternal  (fixed-price)
//   • `os.scarces.auctions`     — start / placeBid / settle / cancel
//   • `os.scarces.offers`       — make / cancel / accept / makeCollection /
//                                 cancelCollection / acceptCollection
//   • `os.scarces.lazy`         — create / purchase / cancel / updatePrice /
//                                 updateExpiry  (mint-on-purchase)
//   • `os.scarces.approvals`    — approve / revoke / revokeAll  (NEP-178)
//   • `os.scarces.storage`      — deposit / withdraw / setSpendingCap /
//                                 withdrawPlatformStorage
//   • `os.scarces.fromPost`     — mint / list  (turn a post into a scarce)
//   • `os.scarces.apps`         — register / setConfig / fund / moderate apps
//
// When the OnSocial client has a `StorageProvider` configured (e.g. Lighthouse),
// file-bearing methods (`tokens.mint`, `collections.create`, `lazy.create`)
// upload locally and sign+relay the resulting action via `/relay/delegate`.
// Otherwise they fall through to the gateway's `/compose/<verb>` endpoint
// (zero-config — the gateway uploads via its own Lighthouse account).
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { SocialModule } from '../social.js';
import type {
  SessionGetter,
  BroadcastGetter,
} from '../../internal/session-bridge.js';
import { ScarcesTokensApi } from './tokens.js';
import { ScarcesCollectionsApi } from './collections.js';
import { ScarcesMarketApi } from './market.js';
import { ScarcesAuctionsApi } from './auctions.js';
import { ScarcesOffersApi } from './offers.js';
import { ScarcesLazyApi } from './lazy.js';
import { ScarcesApprovalsApi } from './approvals.js';
import { ScarcesStorageApi } from './storage.js';
import { ScarcesFromPostApi } from './from-post.js';
import { ScarcesAppsApi } from './apps.js';
import type { QueryModule } from '../../query/index.js';

export class ScarcesModule {
  readonly tokens: ScarcesTokensApi;
  readonly collections: ScarcesCollectionsApi;
  readonly market: ScarcesMarketApi;
  readonly auctions: ScarcesAuctionsApi;
  readonly offers: ScarcesOffersApi;
  readonly lazy: ScarcesLazyApi;
  readonly approvals: ScarcesApprovalsApi;
  readonly storage: ScarcesStorageApi;
  readonly fromPost: ScarcesFromPostApi;
  readonly apps: ScarcesAppsApi;

  constructor(
    http: HttpClient,
    getSession: SessionGetter,
    social?: SocialModule,
    storage?: StorageProvider,
    getBroadcast?: BroadcastGetter,
    query?: QueryModule
  ) {
    this.tokens = new ScarcesTokensApi(http, getSession, storage, getBroadcast);
    this.collections = new ScarcesCollectionsApi(
      http,
      getSession,
      storage,
      getBroadcast
    );
    this.market = new ScarcesMarketApi(http, getSession, getBroadcast);
    this.auctions = new ScarcesAuctionsApi(http, getSession, getBroadcast);
    this.offers = new ScarcesOffersApi(http, getSession, getBroadcast);
    this.lazy = new ScarcesLazyApi(http, getSession, storage, getBroadcast);
    this.approvals = new ScarcesApprovalsApi(http, getSession, getBroadcast);
    this.storage = new ScarcesStorageApi(http, getSession, getBroadcast);
    this.fromPost = new ScarcesFromPostApi(
      this.tokens,
      this.lazy,
      social,
      query
    );
    this.apps = new ScarcesAppsApi(http, getSession, getBroadcast);
  }
}

export {
  ScarcesTokensApi,
  type ScarceTokenMetadata,
  type ScarceTokenView,
} from './tokens.js';
export { ScarcesCollectionsApi } from './collections.js';
export { ScarcesMarketApi } from './market.js';
export { ScarcesAuctionsApi } from './auctions.js';
export { ScarcesOffersApi } from './offers.js';
export { ScarcesLazyApi } from './lazy.js';
export { ScarcesApprovalsApi } from './approvals.js';
export { ScarcesStorageApi } from './storage.js';
export { ScarcesFromPostApi } from './from-post.js';
export { ScarcesAppsApi, type AppConfigInput } from './apps.js';
export { type AllowlistEntry } from './collections.js';
export { SCARCES_VERBS, type ScarcesVerb } from './verbs.js';
// SCARCES_EVENT_TYPES / SCARCES_CONTRACT_EVENTS / ScarcesEventType
// live with the other query taxonomies in `src/query/scarces-events.ts`
// and are re-exported from `os.query` (see `src/query/index.ts`).
