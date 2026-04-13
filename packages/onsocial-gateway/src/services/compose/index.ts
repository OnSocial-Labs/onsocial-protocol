/**
 * Compose service — chains Lighthouse storage + relay into atomic operations.
 *
 * This barrel re-exports all compose sub-modules so existing consumers
 * can keep importing from './services/compose/index.js'.
 *
 * Module map:
 *   shared.ts            — types, ComposeError, Lighthouse upload, relay helpers
 *   set.ts               — core contract: Set (social data)
 *   mint.ts              — scarces: QuickMint, MintFromCollection
 *   collection.ts        — scarces: CreateCollection
 *   lazy-listing.ts      — scarces: lazy listings (deferred-mint)
 *   token.ts             — scarces: transfer, burn, renew, redeem, revoke, refund
 *   approval.ts          — scarces: NEP-178 approvals
 *   collection-manage.ts — scarces: collection lifecycle & allowlists
 *   marketplace.ts       — scarces: secondary market (list, auction, purchase, bid)
 *   offer.ts             — scarces: token & collection offers
 *   app.ts               — scarces: app pools, moderators, storage, admin
 */

// Shared types & helpers
export {
  type UploadedFile,
  type UploadResult,
  type SimpleActionResult,
  ComposeError,
  uploadToLighthouse,
  uploadJsonToLighthouse,
  intentAuth,
  validateRoyalty,
  resolveScarcesTarget,
  nearToYocto,
  MAX_METADATA_LEN,
  MAX_ROYALTY_BPS,
  MAX_ROYALTY_RECIPIENTS,
  MAX_COLLECTION_SUPPLY,
} from './shared.js';

// Set (core contract — any path)
export {
  type ComposeSetRequest,
  type ComposeSetResult,
  type SetActionResult,
  validatePath,
  buildSetAction,
  composeSet,
} from './set.js';

// Mint (scarces contract)
export {
  type ComposeMintRequest,
  type ComposeMintResult,
  type MintActionResult,
  buildMintAction,
  composeMint,
} from './mint.js';

// Create Collection (scarces contract)
export {
  type ComposeCreateCollectionRequest,
  type ComposeCreateCollectionResult,
  type CreateCollectionActionResult,
  buildCreateCollectionAction,
  composeCreateCollection,
} from './collection.js';

// Lazy Listing (scarces contract — deferred-mint marketplace)
export {
  type ComposeLazyListRequest,
  type ComposeLazyListResult,
  type LazyListActionResult,
  type LazyListingSimpleResult,
  composeLazyList,
  buildLazyListAction,
  buildCancelLazyListingAction,
  buildUpdateLazyListingPriceAction,
  buildUpdateLazyListingExpiryAction,
  buildPurchaseLazyListingAction,
} from './lazy-listing.js';

// Token lifecycle (transfer, burn, renew, redeem, revoke, refund)
export {
  buildTransferAction,
  buildBatchTransferAction,
  buildBurnAction,
  buildRenewTokenAction,
  buildRedeemTokenAction,
  buildRevokeTokenAction,
  buildClaimRefundAction,
} from './token.js';

// NEP-178 Approvals
export {
  buildApproveAction,
  buildRevokeApprovalAction,
  buildRevokeAllApprovalsAction,
} from './approval.js';

// Collection management (lifecycle, allowlists, metadata, purchases)
export {
  buildUpdateCollectionPriceAction,
  buildUpdateCollectionTimingAction,
  buildMintFromCollectionAction,
  buildAirdropFromCollectionAction,
  buildPurchaseFromCollectionAction,
  buildPauseCollectionAction,
  buildResumeCollectionAction,
  buildDeleteCollectionAction,
  buildCancelCollectionAction,
  buildWithdrawUnclaimedRefundsAction,
  buildSetAllowlistAction,
  buildRemoveFromAllowlistAction,
  buildSetCollectionMetadataAction,
  buildSetCollectionAppMetadataAction,
} from './collection-manage.js';

// Secondary marketplace (list, delist, auction, purchase, bid)
export {
  buildListNativeScarceAction,
  buildDelistNativeScarceAction,
  buildDelistExternalScarceAction,
  buildUpdateSalePriceAction,
  buildListAuctionAction,
  buildSettleAuctionAction,
  buildCancelAuctionAction,
  buildPurchaseNativeScarceAction,
  buildPlaceBidAction,
} from './marketplace.js';

// Offers (token + collection level)
export {
  buildMakeOfferAction,
  buildCancelOfferAction,
  buildAcceptOfferAction,
  buildMakeCollectionOfferAction,
  buildCancelCollectionOfferAction,
  buildAcceptCollectionOfferAction,
} from './offer.js';

// App management (pools, moderators, storage, admin)
export {
  buildRegisterAppAction,
  buildSetAppConfigAction,
  buildFundAppPoolAction,
  buildWithdrawAppPoolAction,
  buildTransferAppOwnershipAction,
  buildAddModeratorAction,
  buildRemoveModeratorAction,
  buildBanCollectionAction,
  buildUnbanCollectionAction,
  buildStorageDepositAction,
  buildStorageWithdrawAction,
  buildWithdrawPlatformStorageAction,
  buildSetSpendingCapAction,
} from './app.js';
