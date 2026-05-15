// ---------------------------------------------------------------------------
// @onsocial/sdk/advanced — power-user exports
//
// Typed actions, session helpers, NEP-366 encoding, and contract IDs.
// ---------------------------------------------------------------------------

// Session key types
export type { SignerFn, SessionKey } from './session-key.js';

// Typed actions
export type {
  Action,
  CoreAction,
  ScarcesAction,
  RewardsAction,
  TokenMetadata,
  AllowlistEntry,
  ContractName,
  PreparedActionRequest,
} from './actions.js';
export {
  CONTRACTS,
  PERMISSION_LEVEL,
  resolveContractId,
  buildCoreSetAction,
  buildProfileAction,
  buildPostAction,
  buildReplyAction,
  buildQuoteAction,
  buildGroupPostAction,
  buildStandWithAction,
  buildUnstandAction,
  buildReactionAction,
  buildReactionRemoveAction,
  buildSaveAction,
  buildSaveRemoveAction,
  buildEndorseAction,
  buildEndorseRemoveAction,
  buildAttestAction,
  buildAttestRevokeAction,
  // Group lifecycle
  buildCreateGroupAction,
  buildJoinGroupAction,
  buildLeaveGroupAction,
  buildAddGroupMemberAction,
  buildRemoveGroupMemberAction,
  buildApproveJoinRequestAction,
  buildRejectJoinRequestAction,
  buildCancelJoinRequestAction,
  buildBlacklistGroupMemberAction,
  buildUnblacklistGroupMemberAction,
  buildTransferGroupOwnershipAction,
  buildSetGroupPrivacyAction,
  // Governance
  buildCreateProposalAction,
  buildVoteOnProposalAction,
  buildCancelProposalAction,
  buildExpireProposalAction,
  // Permissions / session keys
  buildSetPermissionAction,
  buildSetKeyPermissionAction,
  buildSessionKeyGrantAction,
  buildRewardsCreditAction,
  buildRewardsClaimAction,
  buildScarcesQuickMintAction,
  buildScarcesMintFromCollectionAction,
  buildScarcesCreateCollectionAction,
  buildScarcesTransferAction,
  buildScarcesListNativeAction,
  buildScarcesPurchaseNativeAction,
  buildScarcesCreateLazyListingAction,
  prepareCoreRequest,
  prepareScarcesRequest,
  prepareRewardsRequest,
  buildOptions,
  buildRequest,
} from './actions.js';
export type {
  CreateProposalOptions,
  SetPermissionOptions,
  SetKeyPermissionOptions,
  SessionKeyGrantOptions,
  RequestOptions,
  RequestEnvelope,
} from './actions.js';

// Path / schema helpers
export {
  RESERVED_PREFIXES,
  PATH_DEFAULTS,
  paths,
  validatePath,
  assertValidPaths,
  buildAppSetData,
  mergeSetData,
} from './paths.js';
export type { ValidatePathOptions, MergeOptions } from './paths.js';

// Boost ft_on_transfer msg builders (boost has no `Action` enum)
export {
  BOOST_LOCK_PERIODS,
  buildBoostLockMsg,
  buildBoostCreditsMsg,
  buildBoostFundScheduledMsg,
  encodeBoostFtMsg,
} from './boost-msg.js';
export type { BoostFtMsg, BoostLockPeriod } from './boost-msg.js';

// Session API — high-level wrapper for "sign once in wallet, tap to confirm
// in app" UX. Composes the lower-level onboarding helpers + NEP-366 delegate
// signer.
export {
  Session,
  buildSessionGrant,
  buildSessionRevoke,
  buildSessionOnboardingActions,
  SessionScopeError,
  NeedsWalletConfirmationError,
} from './session.js';
export type {
  SessionContract,
  FunctionCallKeyLimits,
  BuildSessionGrantInput,
  OnboardingPlan,
  SessionConfig,
  SessionOnboardingInput,
} from './session.js';

// NEP-366 SignedDelegateAction encoder. Used by
// Session.signDelegate() to produce the base64 blob for /relay/delegate.
export { buildSignedDelegate, parseEd25519PublicKey } from './nep366.js';
export type {
  DelegateInnerAction,
  AccessKey as DelegateAccessKey,
  BuildSignedDelegateInput,
  BuildSignedDelegateResult,
} from './nep366.js';

// Session bootstrap — one-call onboarding (gen key + one-time wallet approval + persist).
export {
  bootstrapSession,
  restoreSession,
  revokeSession,
  generateEd25519Key,
  restoreEd25519Key,
  base58Encode,
  planToWalletTransactions,
  sessionId,
  MemoryKeyStore,
  localStorageKeyStore,
  nearConnectAdapter,
} from './bootstrap.js';
export type {
  WalletAdapter,
  KeyStore,
  StoredSession,
  GeneratedSessionKey,
  NearAction,
  NearConnectWalletLike,
  BootstrapSessionInput,
  RestoreSessionInput,
  RevokeSessionInput,
} from './bootstrap.js';
