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
export { OnSocialError, RelayExecutionError } from './http.js';

// Modules (for advanced composition)
export { AuthModule } from './auth.js';
export {
  SocialModule,
  resolvePostMedia,
  buildPostSetData,
  buildProfileSetData,
  buildReactionSetData,
  buildReactionRemoveData,
  buildReplySetData,
  buildQuoteSetData,
  buildGroupPostSetData,
  buildGroupPostPath,
  buildGroupReplySetData,
  buildGroupQuoteSetData,
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
export { ScarcesModule } from './modules/scarces/index.js';
export {
  ScarcesTokensApi,
  ScarcesCollectionsApi,
  ScarcesMarketApi,
  ScarcesAuctionsApi,
  ScarcesOffersApi,
  ScarcesLazyApi,
  ScarcesFromPostApi,
} from './modules/scarces/index.js';
export {
  buildQuickMintAction,
  buildTransferScarceAction,
  buildBatchTransferAction,
  buildBurnScarceAction,
  buildCreateCollectionAction,
  buildMintFromCollectionAction,
  buildPurchaseFromCollectionAction,
  buildAirdropAction,
  buildPauseCollectionAction,
  buildResumeCollectionAction,
  buildDeleteCollectionAction,
  buildListNativeScarceAction,
  buildDelistNativeScarceAction,
  buildPurchaseNativeScarceAction,
  buildListAuctionAction,
  buildPlaceBidAction,
  buildSettleAuctionAction,
  buildCancelAuctionAction,
  buildMakeOfferAction,
  buildCancelOfferAction,
  buildAcceptOfferAction,
  buildMakeCollectionOfferAction,
  buildCancelCollectionOfferAction,
  buildAcceptCollectionOfferAction,
  buildCreateLazyListingAction,
  buildPurchaseLazyListingAction,
  extractPostMedia,
  nearToYocto,
} from './builders/scarces/index.js';
export type {
  ExtractedPost,
  MintFromPostOptions,
  PostSource,
  BatchTransferEntry,
  TokenMetadata,
} from './builders/scarces/index.js';
export { RewardsModule } from './rewards.js';
export { buildClaimAction, buildCreditRewardAction } from './rewards.js';
export { QueryModule } from './query/index.js';
export type {
  PostRow,
  ReactionRow,
  Paginated,
  HashtagCount,
  GroupConversation,
  FeedFilter,
  GroupFeedFilter,
} from './query/index.js';
export { StorageModule } from './storage.js';
export {
  GatewayProvider,
  LighthouseProvider,
  probeFile,
  resolveStorageProvider,
} from './storage/provider.js';
export type {
  StorageProvider,
  StorageConfig,
  UploadedMedia,
  UploadedJson,
  UploadOptions,
} from './storage/provider.js';
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
export { GroupsModule } from './modules/groups.js';
export { PostsModule } from './modules/posts.js';
export { ProfilesModule } from './modules/profiles.js';
export type { MaterialisedProfile } from './modules/profiles.js';
export { ReactionsModule } from './modules/reactions.js';
export type {
  ReactionInput,
  ReactionTarget,
  ReactionSummary,
  ToggleOptions as ReactionToggleOptions,
} from './modules/reactions.js';
export { SavesModule } from './modules/saves.js';
export type { SaveTarget } from './modules/saves.js';
export { EndorsementsModule } from './modules/endorsements.js';
export type { EndorsementListItem } from './modules/endorsements.js';
export { AttestationsModule } from './modules/attestations.js';
export type { AttestationListItem } from './modules/attestations.js';
export { PermissionsModule } from './permissions.js';
export { ChainModule } from './chain.js';
export { PagesModule } from './pages.js';
export { StandingsModule } from './modules/standings.js';
export type {
  ContentNamespace,
  EconomyNamespace,
  PlatformNamespace,
  RawNamespace,
} from './namespaces.js';

// Base Social Schema v1 — promotable shared spec
export {
  SCHEMA_VERSION,
  REACTION_KINDS,
  POST_KINDS,
  AUDIENCES,
  inferKind,
  normalizeChannel,
  normalizeAudiences,
  validateProfileV1,
  validateGroupFeedMetaV1,
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
  groupFeedMetaV1,
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
  GroupFeedMetaV1,
  PostV1,
  PostKind,
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
  PostRef,
  GroupPostRef,
  SaveRecord,
  EndorsementRecord,
  AttestationRecord,
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
  ProposalCreateOptions,
  CustomProposalInput,
  TransferOwnershipProposalOptions,
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
