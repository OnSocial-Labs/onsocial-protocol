// ---------------------------------------------------------------------------
// OnSocial SDK — advanced/actions
//
// Type-safe action builders matching the Rust Action enums.
// Uses internally-tagged format: { type: "snake_case_variant", ...fields }
// Must match contract's #[serde(tag = "type", rename_all = "snake_case")].
// ---------------------------------------------------------------------------

import type {
  CollectionOptions,
  CreditRequest,
  LazyListingOptions,
  ListingOptions,
  MintOptions,
  Network,
  PostData,
  ProfileData,
  ReactionData,
} from '../types.js';
import {
  CONTRACTS,
  resolveContractId,
  type ContractName,
} from '../contracts.js';
import {
  buildGroupPostSetData,
  buildPostSetData,
  buildProfileSetData,
  buildQuoteSetData,
  buildReactionSetData,
  buildReactionRemoveData,
  buildReplySetData,
  buildStandingRemoveData,
  buildStandingSetData,
  buildSaveSetData,
  buildSaveRemoveData,
  buildEndorsementSetData,
  buildEndorsementRemoveData,
  buildAttestationSetData,
  buildAttestationRemoveData,
  type SaveBuildInput,
  type EndorsementBuildInput,
  type AttestationBuildInput,
} from '../social.js';
import {
  buildClaimAction as buildClaimRewardActionInternal,
  buildCreditRewardAction as buildCreditRewardActionInternal,
} from '../rewards.js';
import {
  buildCreateCollectionAction as buildCreateCollectionActionInternal,
  buildCreateLazyListingAction as buildCreateLazyListingActionInternal,
  buildListNativeScarceAction as buildListNativeScarceActionInternal,
  buildMintFromCollectionAction as buildMintFromCollectionActionInternal,
  buildPurchaseNativeScarceAction as buildPurchaseNativeScarceActionInternal,
  buildQuickMintAction as buildQuickMintActionInternal,
  buildTransferScarceAction as buildTransferScarceActionInternal,
} from '../scarces.js';

// ── Core Actions (core-onsocial) ────────────────────────────────────────────

export type CoreAction =
  | { type: 'set'; data: Record<string, unknown> }
  | { type: 'create_group'; group_id: string; config: Record<string, unknown> }
  | { type: 'join_group'; group_id: string }
  | { type: 'leave_group'; group_id: string }
  | { type: 'add_group_member'; group_id: string; member_id: string }
  | { type: 'remove_group_member'; group_id: string; member_id: string }
  | { type: 'approve_join_request'; group_id: string; requester_id: string }
  | {
      type: 'reject_join_request';
      group_id: string;
      requester_id: string;
      reason?: string;
    }
  | { type: 'cancel_join_request'; group_id: string }
  | { type: 'blacklist_group_member'; group_id: string; member_id: string }
  | { type: 'unblacklist_group_member'; group_id: string; member_id: string }
  | {
      type: 'transfer_group_ownership';
      group_id: string;
      new_owner: string;
      remove_old_owner?: boolean;
    }
  | { type: 'set_group_privacy'; group_id: string; is_private: boolean }
  | {
      type: 'create_proposal';
      group_id: string;
      proposal_type: string;
      changes: Record<string, unknown>;
      auto_vote?: boolean;
      description?: string;
    }
  | {
      type: 'vote_on_proposal';
      group_id: string;
      proposal_id: string;
      approve: boolean;
    }
  | { type: 'cancel_proposal'; group_id: string; proposal_id: string }
  | {
      type: 'set_permission';
      grantee: string;
      path: string;
      level: number;
      expires_at?: string;
    }
  | {
      type: 'set_key_permission';
      public_key: string;
      path: string;
      level: number;
      expires_at?: string;
    };

// ── Scarces Actions (scarces-onsocial) ──────────────────────────────────────

export type ScarcesAction =
  // Minting
  | {
      type: 'quick_mint';
      metadata: TokenMetadata;
      royalty?: Record<string, number>;
      app_id?: string;
      transferable?: boolean;
      burnable?: boolean;
    }
  | {
      type: 'mint_from_collection';
      collection_id: string;
      quantity: number;
      receiver_id?: string;
    }
  | {
      type: 'airdrop_from_collection';
      collection_id: string;
      receivers: string[];
    }
  // Transfers
  | {
      type: 'transfer_scarce';
      receiver_id: string;
      token_id: string;
      memo?: string;
    }
  | {
      type: 'batch_transfer';
      transfers: Array<{
        receiver_id: string;
        token_id: string;
        memo?: string;
      }>;
    }
  // Approvals
  | {
      type: 'approve_scarce';
      token_id: string;
      account_id: string;
      msg?: string;
    }
  | { type: 'revoke_scarce'; token_id: string; account_id: string }
  | { type: 'revoke_all_scarce'; token_id: string }
  // Lifecycle
  | { type: 'burn_scarce'; token_id: string; collection_id?: string }
  | {
      type: 'renew_token';
      token_id: string;
      collection_id: string;
      new_expires_at: number;
    }
  | {
      type: 'revoke_token';
      token_id: string;
      collection_id: string;
      memo?: string;
    }
  | { type: 'redeem_token'; token_id: string; collection_id: string }
  | { type: 'claim_refund'; token_id: string; collection_id: string }
  // Collections
  | {
      type: 'create_collection';
      collection_id: string;
      total_supply: number;
      metadata_template: string;
      price_near: string;
      start_time?: number;
      end_time?: number;
      royalty?: Record<string, number>;
      app_id?: string;
      mint_mode?: string;
      max_per_wallet?: number;
      renewable?: boolean;
      transferable?: boolean;
      burnable?: boolean;
      revocation_mode?: string;
      max_redeems?: number;
      metadata?: string;
      start_price?: string;
      allowlist_price?: string;
    }
  | {
      type: 'update_collection_price';
      collection_id: string;
      new_price_near: string;
    }
  | {
      type: 'update_collection_timing';
      collection_id: string;
      start_time?: number;
      end_time?: number;
    }
  | { type: 'delete_collection'; collection_id: string }
  | { type: 'pause_collection'; collection_id: string }
  | { type: 'resume_collection'; collection_id: string }
  | { type: 'set_allowlist'; collection_id: string; entries: AllowlistEntry[] }
  | { type: 'remove_from_allowlist'; collection_id: string; accounts: string[] }
  | {
      type: 'set_collection_metadata';
      collection_id: string;
      metadata?: string;
    }
  | {
      type: 'set_collection_app_metadata';
      app_id: string;
      collection_id: string;
      metadata?: string;
    }
  | { type: 'withdraw_unclaimed_refunds'; collection_id: string }
  | {
      type: 'cancel_collection';
      collection_id: string;
      refund_per_token: string;
      refund_deadline_ns?: number;
    }
  // Marketplace
  | {
      type: 'list_native_scarce';
      token_id: string;
      price: string;
      expires_at?: number;
    }
  | { type: 'delist_native_scarce'; token_id: string }
  | {
      type: 'list_native_scarce_auction';
      token_id: string;
      reserve_price: string;
      min_bid_increment: string;
      expires_at?: number;
      auction_duration_ns?: number;
      anti_snipe_extension_ns?: number;
      buy_now_price?: string;
    }
  | { type: 'settle_auction'; token_id: string }
  | { type: 'cancel_auction'; token_id: string }
  | { type: 'delist_scarce'; scarce_contract_id: string; token_id: string }
  | {
      type: 'update_price';
      scarce_contract_id: string;
      token_id: string;
      price: string;
    }
  | {
      type: 'purchase_from_collection';
      collection_id: string;
      quantity: number;
      max_price_per_token: string;
    }
  | { type: 'purchase_lazy_listing'; listing_id: string }
  | { type: 'purchase_native_scarce'; token_id: string }
  | { type: 'place_bid'; token_id: string; amount: string }
  // Offers
  | {
      type: 'make_offer';
      token_id: string;
      amount: string;
      expires_at?: number;
    }
  | { type: 'cancel_offer'; token_id: string }
  | { type: 'accept_offer'; token_id: string; buyer_id: string }
  | {
      type: 'make_collection_offer';
      collection_id: string;
      amount: string;
      expires_at?: number;
    }
  | { type: 'cancel_collection_offer'; collection_id: string }
  | {
      type: 'accept_collection_offer';
      collection_id: string;
      token_id: string;
      buyer_id: string;
    }
  // Lazy listings
  | {
      type: 'create_lazy_listing';
      metadata: TokenMetadata;
      price: string;
      royalty?: Record<string, number>;
      app_id?: string;
      transferable?: boolean;
      burnable?: boolean;
      expires_at?: number;
    }
  | { type: 'cancel_lazy_listing'; listing_id: string }
  | { type: 'update_lazy_listing_price'; listing_id: string; new_price: string }
  | {
      type: 'update_lazy_listing_expiry';
      listing_id: string;
      new_expires_at?: number;
    }
  // App/Admin
  | { type: 'fund_app_pool'; app_id: string }
  | { type: 'storage_deposit'; account_id?: string }
  | {
      type: 'register_app';
      app_id: string;
      max_user_bytes?: number;
      default_royalty?: Record<string, number>;
      primary_sale_bps?: number;
      curated?: boolean;
      metadata?: string;
    }
  | { type: 'set_spending_cap'; cap?: string }
  | { type: 'storage_withdraw' }
  | { type: 'withdraw_app_pool'; app_id: string; amount: string }
  | { type: 'withdraw_platform_storage'; amount: string }
  | {
      type: 'set_app_config';
      app_id: string;
      max_user_bytes?: number;
      default_royalty?: Record<string, number>;
      primary_sale_bps?: number;
      curated?: boolean;
      metadata?: string;
    }
  | { type: 'transfer_app_ownership'; app_id: string; new_owner: string }
  | { type: 'add_moderator'; app_id: string; account_id: string }
  | { type: 'remove_moderator'; app_id: string; account_id: string }
  | {
      type: 'ban_collection';
      app_id: string;
      collection_id: string;
      reason?: string;
    }
  | { type: 'unban_collection'; app_id: string; collection_id: string };

export interface TokenMetadata {
  title: string;
  description?: string;
  media?: string;
  media_hash?: string;
  copies?: number;
  extra?: string;
  reference?: string;
  reference_hash?: string;
}

export interface AllowlistEntry {
  account_id: string;
  allocation: number;
}

// ── Rewards Actions (rewards-onsocial) ──────────────────────────────────────

export type RewardsAction =
  | {
      type: 'credit_reward';
      account_id: string;
      amount: string;
      source?: string;
      app_id?: string;
    }
  | { type: 'claim' };

// ── Union of all actions ────────────────────────────────────────────────────

export type Action = CoreAction | ScarcesAction | RewardsAction;

// ── Contract IDs ────────────────────────────────────────────────────────────

export { CONTRACTS, resolveContractId };
export type { ContractName };

export interface PreparedActionRequest<T extends Action = Action> {
  targetAccount: string;
  action: T;
  options?: RequestOptions;
}

/** Mirrors `Options` from contracts/core-onsocial/src/protocol/types.rs. */
export interface RequestOptions {
  /** Refund unused deposit to payer instead of crediting actor's storage. */
  refund_unused_deposit?: boolean;
}

/** Mirrors `Request` envelope from contracts/core-onsocial. */
export interface RequestEnvelope<T extends Action = Action> {
  target_account?: string;
  action: T;
  auth?: Record<string, unknown>;
  options?: RequestOptions;
}

export function buildOptions(opts: RequestOptions): RequestOptions {
  const out: RequestOptions = {};
  if (opts.refund_unused_deposit !== undefined) {
    out.refund_unused_deposit = opts.refund_unused_deposit;
  }
  return out;
}

/**
 * Build a full contract `Request` envelope (target + action + optional auth/options).
 * Use this when you need to send the raw `execute` payload to a contract.
 */
export function buildRequest<T extends Action>(input: {
  action: T;
  targetAccount?: string;
  auth?: Record<string, unknown>;
  options?: RequestOptions;
}): RequestEnvelope<T> {
  const env: RequestEnvelope<T> = { action: input.action };
  if (input.targetAccount !== undefined)
    env.target_account = input.targetAccount;
  if (input.auth !== undefined) env.auth = input.auth;
  if (input.options !== undefined) env.options = input.options;
  return env;
}

export function buildCoreSetAction(data: Record<string, unknown>): CoreAction {
  return { type: 'set', data };
}

export function buildProfileAction(profile: ProfileData): CoreAction {
  return buildCoreSetAction(buildProfileSetData(profile));
}

export function buildPostAction(
  post: PostData,
  postId: string,
  now?: number
): CoreAction {
  return buildCoreSetAction(buildPostSetData(post, postId, now));
}

export function buildStandWithAction(
  targetAccount: string,
  now?: number
): CoreAction {
  return buildCoreSetAction(buildStandingSetData(targetAccount, now));
}

export function buildUnstandAction(targetAccount: string): CoreAction {
  return buildCoreSetAction(buildStandingRemoveData(targetAccount));
}

export function buildReactionAction(
  ownerAccount: string,
  contentPath: string,
  reaction: ReactionData
): CoreAction {
  return buildCoreSetAction(
    buildReactionSetData(ownerAccount, contentPath, reaction)
  );
}

/** Tombstone a previously-set reaction. Must specify the same `kind` used to set. */
export function buildReactionRemoveAction(
  ownerAccount: string,
  kind: string,
  contentPath: string
): CoreAction {
  return buildCoreSetAction(
    buildReactionRemoveData(ownerAccount, kind, contentPath)
  );
}

// ── Saves (private bookmarks) ─────────────────────────────────────────────

export function buildSaveAction(
  contentPath: string,
  input: SaveBuildInput = {}
): CoreAction {
  return buildCoreSetAction(buildSaveSetData(contentPath, input));
}

export function buildSaveRemoveAction(contentPath: string): CoreAction {
  return buildCoreSetAction(buildSaveRemoveData(contentPath));
}

// ── Endorsements ─────────────────────────────────────────────────────────

export function buildEndorseAction(
  targetAccount: string,
  input: EndorsementBuildInput = {}
): CoreAction {
  return buildCoreSetAction(buildEndorsementSetData(targetAccount, input));
}

export function buildEndorseRemoveAction(
  targetAccount: string,
  topic?: string
): CoreAction {
  return buildCoreSetAction(buildEndorsementRemoveData(targetAccount, topic));
}

// ── Attestations ─────────────────────────────────────────────────────────

export function buildAttestAction(
  claimId: string,
  input: AttestationBuildInput
): CoreAction {
  return buildCoreSetAction(buildAttestationSetData(claimId, input));
}

export function buildAttestRevokeAction(
  subject: string,
  type: string,
  claimId: string
): CoreAction {
  return buildCoreSetAction(buildAttestationRemoveData(subject, type, claimId));
}

export function buildRewardsCreditAction(
  req: CreditRequest & { amount: string }
): RewardsAction {
  return buildCreditRewardActionInternal(req);
}

export function buildRewardsClaimAction(): RewardsAction {
  return buildClaimRewardActionInternal();
}

export function buildScarcesQuickMintAction(opts: MintOptions): ScarcesAction {
  return buildQuickMintActionInternal(opts);
}

export function buildScarcesMintFromCollectionAction(
  collectionId: string,
  quantity = 1,
  receiverId?: string
): ScarcesAction {
  return buildMintFromCollectionActionInternal(
    collectionId,
    quantity,
    receiverId
  );
}

export function buildScarcesCreateCollectionAction(
  opts: CollectionOptions
): ScarcesAction {
  return buildCreateCollectionActionInternal(opts);
}

export function buildScarcesTransferAction(
  tokenId: string,
  receiverId: string,
  memo?: string
): ScarcesAction {
  return buildTransferScarceActionInternal(tokenId, receiverId, memo);
}

export function buildScarcesListNativeAction(
  opts: ListingOptions
): ScarcesAction {
  return buildListNativeScarceActionInternal(opts);
}

export function buildScarcesPurchaseNativeAction(
  tokenId: string
): ScarcesAction {
  return buildPurchaseNativeScarceActionInternal(tokenId);
}

export function buildScarcesCreateLazyListingAction(
  opts: LazyListingOptions
): ScarcesAction {
  return buildCreateLazyListingActionInternal(opts);
}

export function prepareCoreRequest(
  action: CoreAction,
  network: Network = 'mainnet',
  targetAccount?: string,
  options?: RequestOptions
): PreparedActionRequest<CoreAction> {
  const req: PreparedActionRequest<CoreAction> = {
    targetAccount: targetAccount ?? resolveContractId(network, 'core'),
    action,
  };
  if (options) req.options = options;
  return req;
}

export function prepareScarcesRequest(
  action: ScarcesAction,
  network: Network = 'mainnet',
  targetAccount?: string,
  options?: RequestOptions
): PreparedActionRequest<ScarcesAction> {
  const req: PreparedActionRequest<ScarcesAction> = {
    targetAccount: targetAccount ?? resolveContractId(network, 'scarces'),
    action,
  };
  if (options) req.options = options;
  return req;
}

export function prepareRewardsRequest(
  action: RewardsAction,
  network: Network = 'mainnet',
  targetAccount?: string,
  options?: RequestOptions
): PreparedActionRequest<RewardsAction> {
  const req: PreparedActionRequest<RewardsAction> = {
    targetAccount: targetAccount ?? resolveContractId(network, 'rewards'),
    action,
  };
  if (options) req.options = options;
  return req;
}

// ── Group action builders ───────────────────────────────────────────────────
//
// Mirror the `Action::*Group*` variants from contracts/core-onsocial.
// All take native JS values; the Rust side serializes config/changes as
// generic JSON, so callers can attach arbitrary structured data.

export function buildCreateGroupAction(
  groupId: string,
  config: Record<string, unknown> = {}
): CoreAction {
  return { type: 'create_group', group_id: groupId, config };
}

export function buildJoinGroupAction(groupId: string): CoreAction {
  return { type: 'join_group', group_id: groupId };
}

export function buildLeaveGroupAction(groupId: string): CoreAction {
  return { type: 'leave_group', group_id: groupId };
}

export function buildAddGroupMemberAction(
  groupId: string,
  memberId: string
): CoreAction {
  return { type: 'add_group_member', group_id: groupId, member_id: memberId };
}

export function buildRemoveGroupMemberAction(
  groupId: string,
  memberId: string
): CoreAction {
  return {
    type: 'remove_group_member',
    group_id: groupId,
    member_id: memberId,
  };
}

export function buildApproveJoinRequestAction(
  groupId: string,
  requesterId: string
): CoreAction {
  return {
    type: 'approve_join_request',
    group_id: groupId,
    requester_id: requesterId,
  };
}

export function buildRejectJoinRequestAction(
  groupId: string,
  requesterId: string,
  reason?: string
): CoreAction {
  const action: CoreAction = {
    type: 'reject_join_request',
    group_id: groupId,
    requester_id: requesterId,
  };
  if (reason !== undefined) action.reason = reason;
  return action;
}

export function buildCancelJoinRequestAction(groupId: string): CoreAction {
  return { type: 'cancel_join_request', group_id: groupId };
}

export function buildBlacklistGroupMemberAction(
  groupId: string,
  memberId: string
): CoreAction {
  return {
    type: 'blacklist_group_member',
    group_id: groupId,
    member_id: memberId,
  };
}

export function buildUnblacklistGroupMemberAction(
  groupId: string,
  memberId: string
): CoreAction {
  return {
    type: 'unblacklist_group_member',
    group_id: groupId,
    member_id: memberId,
  };
}

export function buildTransferGroupOwnershipAction(
  groupId: string,
  newOwner: string,
  removeOldOwner?: boolean
): CoreAction {
  const action: CoreAction = {
    type: 'transfer_group_ownership',
    group_id: groupId,
    new_owner: newOwner,
  };
  if (removeOldOwner !== undefined) action.remove_old_owner = removeOldOwner;
  return action;
}

export function buildSetGroupPrivacyAction(
  groupId: string,
  isPrivate: boolean
): CoreAction {
  return {
    type: 'set_group_privacy',
    group_id: groupId,
    is_private: isPrivate,
  };
}

// ── Governance action builders ──────────────────────────────────────────────

export interface CreateProposalOptions {
  groupId: string;
  proposalType: string;
  changes: Record<string, unknown>;
  autoVote?: boolean;
  description?: string;
}

export function buildCreateProposalAction(
  opts: CreateProposalOptions
): CoreAction {
  const action: CoreAction = {
    type: 'create_proposal',
    group_id: opts.groupId,
    proposal_type: opts.proposalType,
    changes: opts.changes,
  };
  if (opts.autoVote !== undefined) action.auto_vote = opts.autoVote;
  if (opts.description !== undefined) action.description = opts.description;
  return action;
}

export function buildVoteOnProposalAction(
  groupId: string,
  proposalId: string,
  approve: boolean
): CoreAction {
  return {
    type: 'vote_on_proposal',
    group_id: groupId,
    proposal_id: proposalId,
    approve,
  };
}

export function buildCancelProposalAction(
  groupId: string,
  proposalId: string
): CoreAction {
  return {
    type: 'cancel_proposal',
    group_id: groupId,
    proposal_id: proposalId,
  };
}

// ── Permission action builders ──────────────────────────────────────────────

/** Permission level constants matching contract domain values. */
export const PERMISSION_LEVEL = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  MANAGE: 3,
} as const;

export interface SetPermissionOptions {
  grantee: string;
  path: string;
  level: number;
  /** Unix milliseconds; serialized as a string-encoded u64. */
  expiresAtMs?: number | string;
}

export function buildSetPermissionAction(
  opts: SetPermissionOptions
): CoreAction {
  const action: CoreAction = {
    type: 'set_permission',
    grantee: opts.grantee,
    path: opts.path,
    level: opts.level,
  };
  if (opts.expiresAtMs !== undefined) {
    action.expires_at = String(opts.expiresAtMs);
  }
  return action;
}

export interface SetKeyPermissionOptions {
  /** NEAR-format public key, e.g. `ed25519:<base58>`. */
  publicKey: string;
  path: string;
  level: number;
  /** Unix milliseconds; serialized as a string-encoded u64. */
  expiresAtMs?: number | string;
}

export function buildSetKeyPermissionAction(
  opts: SetKeyPermissionOptions
): CoreAction {
  const action: CoreAction = {
    type: 'set_key_permission',
    public_key: opts.publicKey,
    path: opts.path,
    level: opts.level,
  };
  if (opts.expiresAtMs !== undefined) {
    action.expires_at = String(opts.expiresAtMs);
  }
  return action;
}

/**
 * Issue a scoped session key. Convenience over `buildSetKeyPermissionAction`
 * with sensible defaults: `WRITE` level and a 24-hour expiry.
 *
 * The caller is expected to generate the keypair (e.g. via Web Crypto's
 * Ed25519 support) and pass the NEAR-format public key. We avoid bundling
 * a keypair generator to keep `@onsocial/sdk` zero-dependency.
 */
export interface SessionKeyGrantOptions {
  publicKey: string;
  path: string;
  level?: number;
  /** TTL in milliseconds. Defaults to 24h. */
  ttlMs?: number;
  /** Override clock (mainly for tests). */
  now?: number;
}

export function buildSessionKeyGrantAction(
  opts: SessionKeyGrantOptions
): CoreAction {
  const ttl = opts.ttlMs ?? 24 * 60 * 60 * 1000;
  const now = opts.now ?? Date.now();
  return buildSetKeyPermissionAction({
    publicKey: opts.publicKey,
    path: opts.path,
    level: opts.level ?? PERMISSION_LEVEL.WRITE,
    expiresAtMs: now + ttl,
  });
}

// ── Reply / quote / group-post core action wrappers ─────────────────────────

export function buildReplyAction(
  parentAuthor: string,
  parentId: string,
  post: PostData,
  replyId: string,
  now?: number
): CoreAction {
  return buildCoreSetAction(
    buildReplySetData(parentAuthor, parentId, post, replyId, now)
  );
}

export function buildQuoteAction(
  refAuthor: string,
  refPath: string,
  post: PostData,
  quoteId: string,
  now?: number
): CoreAction {
  return buildCoreSetAction(
    buildQuoteSetData(refAuthor, refPath, post, quoteId, now)
  );
}

export function buildGroupPostAction(
  groupId: string,
  post: PostData,
  postId: string,
  now?: number
): CoreAction {
  return buildCoreSetAction(buildGroupPostSetData(groupId, post, postId, now));
}
