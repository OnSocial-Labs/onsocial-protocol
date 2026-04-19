// ---------------------------------------------------------------------------
// @onsocial/sdk — public API
// ---------------------------------------------------------------------------

export { OnSocial } from './client.js';
export type {
  ExecuteAction,
  ExecuteOptions,
  SignedAuth,
  MintPostOptions,
  MintPostResult,
} from './client.js';
export { OnSocialError } from './http.js';

// Modules (for advanced composition)
export { AuthModule } from './auth.js';
export {
  SocialModule,
  buildPostSetData,
  buildProfileSetData,
  buildReactionSetData,
  buildReactionRemoveData,
  buildReplySetData,
  buildQuoteSetData,
  buildGroupPostSetData,
  buildStandingRemoveData,
  buildStandingSetData,
  buildSaveSetData,
  buildSaveRemoveData,
  buildEndorsementSetData,
  buildEndorsementRemoveData,
  buildAttestationSetData,
  buildAttestationRemoveData,
} from './social.js';
export type {
  SaveBuildInput,
  EndorsementBuildInput,
  EndorsementWeightInput,
  AttestationBuildInput,
  AttestationSignatureInput,
} from './social.js';
export {
  ScarcesModule,
  buildCreateCollectionAction,
  buildCreateLazyListingAction,
  buildListNativeScarceAction,
  buildMintFromCollectionAction,
  buildPurchaseNativeScarceAction,
  buildQuickMintAction,
  buildTransferScarceAction,
  nearToYocto,
} from './scarces.js';
export { RewardsModule } from './rewards.js';
export { buildClaimAction, buildCreditRewardAction } from './rewards.js';
export { QueryModule } from './query.js';
export type { PostRow, ReactionRow, Paginated, HashtagCount } from './query.js';
export { StorageModule } from './storage.js';
export { WebhooksModule, verifyWebhookSignature } from './webhooks.js';
export type { WebhookEndpoint, CreateWebhookParams } from './webhooks.js';
export { NotificationsModule } from './notifications.js';
export type {
  Notification,
  ListNotificationsParams,
  ListNotificationsResult,
  NotificationEvent,
  SendEventsParams,
  NotificationRule,
  CreateRuleParams,
} from './notifications.js';
export { GroupsModule } from './groups.js';
export { PermissionsModule } from './permissions.js';
export { ChainModule } from './chain.js';
export { PagesModule } from './pages.js';

// Base Social Schema v1 — promotable shared spec
export {
  SCHEMA_VERSION,
  REACTION_KINDS,
  validateProfileV1,
  validatePostV1,
  validateReactionV1,
  validateStandingV1,
  validateGroupConfigV1,
  validateSaveV1,
  validateEndorsementV1,
  validateAttestationV1,
  assertProfileV1,
  assertPostV1,
  assertReactionV1,
  assertStandingV1,
  assertGroupConfigV1,
  assertSaveV1,
  assertEndorsementV1,
  assertAttestationV1,
  profileV1,
  postV1,
  reactionV1,
  standingV1,
  groupConfigV1,
  saveV1,
  endorsementV1,
  attestationV1,
} from './schema/v1.js';
export type {
  MediaRef,
  ProfileV1,
  ProfileLink,
  PostV1,
  Embed,
  ParentType,
  RefType,
  AccessLevel,
  ContentType,
  ReactionV1,
  ReactionKind,
  StandingV1,
  GroupConfigV1,
  SaveV1,
  EndorsementV1,
  EndorsementWeight,
  AttestationV1,
  AttestationSignature,
} from './schema/v1.js';

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
  GroupMemberData,
  GroupStats,
  JoinRequest,
  ProposalStatus,
  VotingConfig,
  Proposal,
  ProposalTally,
  Vote,
  ListProposalsOptions,
  PermissionLevel,
  AccountSharedStorage,
  OnChainStorageBalance,
  PlatformPoolInfo,
  PlatformAllowanceInfo,
  ContractStatus,
  GovernanceConfig,
  ContractInfo,
  PageSection,
  PageTheme,
  PageConfig,
  PageData,
} from './types.js';
