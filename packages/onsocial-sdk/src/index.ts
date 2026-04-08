// ---------------------------------------------------------------------------
// @onsocial/sdk — public API
// ---------------------------------------------------------------------------

export { OnSocial } from './client.js';
export { OnSocialError } from './http.js';

// Modules (for advanced composition)
export { AuthModule } from './auth.js';
export { SocialModule } from './social.js';
export { ScarcesModule } from './scarces.js';
export { RewardsModule } from './rewards.js';
export { QueryModule } from './query.js';
export { StorageModule } from './storage.js';

// Types
export type {
  Network,
  Tier,
  OnSocialConfig,
  LoginRequest,
  LoginResponse,
  AuthInfo,
  RelayResponse,
  PrepareResponse,
  UploadResult,
  ProfileData,
  PostData,
  ReactionData,
  EntryView,
  KeyEntry,
  ListKeysOptions,
  MintOptions,
  MintResponse,
  CollectionOptions,
  ListingOptions,
  AuctionOptions,
  LazyListingOptions,
  OfferOptions,
  CollectionOfferOptions,
  CreditRequest,
  CreditResponse,
  ClaimResponse,
  RewardBalance,
  GraphQLRequest,
  GraphQLResponse,
  QueryLimits,
  StorageUploadResponse,
  ApiError,
} from './types.js';
