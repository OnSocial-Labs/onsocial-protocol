// ---------------------------------------------------------------------------
// Pure scarces action builders.
//
// Every function here is synchronous, side-effect-free, and produces JSON
// that the on-chain `scarces-onsocial` contract action enum accepts
// verbatim. They never touch HTTP, signing, or storage providers — those
// concerns live in the module facade (`src/modules/scarces/*`).
//
// Re-exported from `@onsocial/sdk/advanced` for power users who want to
// build actions client-side, sign them, and submit via `os.raw.submit` or
// `os.raw.execute`.
// ---------------------------------------------------------------------------

export {
  buildTokenMetadata,
  nearToYocto,
  parseOptionalU64,
} from './_shared.js';
export type { TokenMetadata } from './_shared.js';

export {
  buildQuickMintAction,
  buildTransferScarceAction,
  buildBatchTransferAction,
  buildBurnScarceAction,
} from './tokens.js';
export type { BatchTransferEntry } from './tokens.js';

export {
  buildCreateCollectionAction,
  buildMintFromCollectionAction,
  buildPurchaseFromCollectionAction,
  buildAirdropAction,
  buildPauseCollectionAction,
  buildResumeCollectionAction,
  buildDeleteCollectionAction,
} from './collections.js';

export {
  buildListNativeScarceAction,
  buildDelistNativeScarceAction,
  buildPurchaseNativeScarceAction,
} from './market.js';

export {
  buildListAuctionAction,
  buildPlaceBidAction,
  buildSettleAuctionAction,
  buildCancelAuctionAction,
} from './auctions.js';

export {
  buildMakeOfferAction,
  buildCancelOfferAction,
  buildAcceptOfferAction,
  buildMakeCollectionOfferAction,
  buildCancelCollectionOfferAction,
  buildAcceptCollectionOfferAction,
} from './offers.js';

export {
  buildCreateLazyListingAction,
  buildPurchaseLazyListingAction,
} from './lazy.js';

export { extractPostMedia, isPostRow, postCoords } from './from-post.js';
export type {
  ExtractedPost,
  MintFromPostOptions,
  PostSource,
} from './from-post.js';
