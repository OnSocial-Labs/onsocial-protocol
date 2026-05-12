// ---------------------------------------------------------------------------
// @onsocial/sdk — public API
// ---------------------------------------------------------------------------

export { OnSocial } from './client.js';
export type {
  ExecuteAction,
  ExecuteOptions,
  MintPostOptions,
  MintPostResult,
} from './client.js';
export { OnSocialError, RelayExecutionError } from './internal/http.js';
export { SessionRequiredError } from './internal/session-bridge.js';

// Modules (for advanced composition)
export { AuthModule } from './internal/auth.js';
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
} from './modules/social.js';
export type {
  SaveBuildInput,
  EndorsementBuildInput,
  EndorsementWeightInput,
  AttestationBuildInput,
  AttestationSignatureInput,
} from './modules/social.js';
export { ScarcesModule } from './modules/scarces/index.js';
export {
  ScarcesTokensApi,
  ScarcesCollectionsApi,
  ScarcesMarketApi,
  ScarcesAuctionsApi,
  ScarcesOffersApi,
  ScarcesLazyApi,
  ScarcesFromPostApi,
  ScarcesAppsApi,
} from './modules/scarces/index.js';
export type { PostScarceEmbed } from './modules/scarces/from-post.js';
export type {
  AppConfigInput,
  AllowlistEntry,
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
export { RewardsModule } from './modules/rewards.js';
export {
  buildClaimAction,
  buildCreditRewardAction,
} from './modules/rewards.js';
export { QueryModule } from './query/index.js';
export {
  SubscribeModule,
  ScarcesSubscribeApi,
} from './modules/subscribe/index.js';
export type {
  Unsubscribe,
  SubscriptionInfo,
  SubscriptionHandler,
  SubscribeOptions,
} from './modules/subscribe/index.js';
export type {
  PostRow,
  ReactionRow,
  Paginated,
  HashtagCount,
  GroupConversation,
  FeedFilter,
  GroupFeedFilter,
  StorageEventRow,
  PermissionEventRow,
  GovernanceEventRow,
  RewardsEventRow,
  UserRewardStateRow,
  TokenEventRow,
  TokenAccountActivityRow,
  BoostEventRow,
  BoosterStateRow,
  BoostCreditPurchaseRow,
} from './query/index.js';
export {
  PERMISSION_OPERATIONS,
  GOVERNANCE_OPERATIONS,
  REWARDS_EVENT_TYPES,
  TOKEN_EVENT_TYPES,
  BOOST_EVENT_TYPES,
  SCARCES_OPERATIONS,
  SCARCES_EVENT_TYPES,
} from './query/index.js';
export { StorageModule } from './storage/module.js';
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
export { WebhooksModule, verifyWebhookSignature } from './modules/webhooks.js';
export type {
  WebhookEndpoint,
  CreateWebhookParams,
} from './modules/webhooks.js';
export { NotificationsModule } from './modules/notifications.js';
export type {
  Notification,
  ListNotificationsParams,
  ListNotificationsResult,
  NotificationEvent,
  SendEventsParams,
  NotificationRule,
  CreateRuleParams,
} from './modules/notifications.js';
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
export { PermissionsModule } from './modules/permissions.js';
export { PERMISSION, type PermissionName } from './modules/permissions.js';
export { ChainModule } from './modules/chain.js';
export { TokenModule } from './modules/token.js';
export type { FtMetadata, FtStorageBalance } from './modules/token.js';
export { BoostModule } from './modules/boost.js';
export type {
  BoostAccountView,
  BoostContractStats,
  BoostLockStatus,
  BoostRewardRate,
} from './modules/boost.js';
export { PagesModule } from './modules/pages.js';
export { StandingsModule } from './modules/standings.js';
export {
  StorageAccountModule,
  type AmountInput,
  type DepositWriteOptions,
  type TransactionSigner,
  type TxObserver,
  type WriteOptions,
} from './modules/storage-account.js';
export { NEAR, nearMath, type NearAmount } from './near-amount.js';
export {
  StorageAccountError,
  InsufficientStorageBalanceError,
  PermissionDeniedError,
  SignerRequiredError,
} from './errors.js';
export type {
  ContentNamespace,
  EconomyNamespace,
  PlatformNamespace,
  RawNamespace,
} from './internal/namespaces.js';

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
  BroadcastTarget,
  WalletBroadcastSigner,
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

// ── Text-card preview (live preview for scarce mint UIs) ───────────────────
// Re-exported from the shared @onsocial/text-card package so client UIs can
// render byte-identical previews of what the gateway will produce at mint
// time. Use `previewTextCard({ title, creator, theme: { bg } })` to get
// `{ svg, dataUri }` and bind to an <img src> for a live preview.
export {
  previewTextCard,
  generateTextCardSvg,
  resolveMood,
  isMoodKey,
  THEME_MANIFEST,
  MOODS,
  type MoodKey,
  type Mood,
  type TextCardOptions,

  // v0.3.1 customisation
  MARK_COLORS,
  MARK_SHAPES,
  isMarkColor,
  isMarkShape,
  isTitleAlign,
  type MarkColor,
  type MarkShape,
  type TitleAlign,
} from '@onsocial/text-card';
