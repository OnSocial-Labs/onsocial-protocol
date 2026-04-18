// ---------------------------------------------------------------------------
// @onsocial/sdk/advanced — power-user exports
//
// Signing, typed actions, direct relayer, and contract IDs.
// ---------------------------------------------------------------------------

// Signing
export {
  DOMAIN_PREFIX,
  canonicalize,
  buildSigningPayload,
  buildSigningMessage,
} from './signing.js';
export type { SigningPayloadInput } from './signing.js';

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

// Direct relayer
export { DirectRelay } from './relay.js';
export type { RelayerConfig, SignedRequest } from './relay.js';

// Boost ft_on_transfer msg builders (boost has no `Action` enum)
export {
  BOOST_LOCK_PERIODS,
  buildBoostLockMsg,
  buildBoostCreditsMsg,
  buildBoostFundScheduledMsg,
  encodeBoostFtMsg,
} from './boost-msg.js';
export type { BoostFtMsg, BoostLockPeriod } from './boost-msg.js';
