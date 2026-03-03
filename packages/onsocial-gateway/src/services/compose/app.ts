/**
 * Compose: App management — register apps, manage pools, moderators, storage.
 *
 * Each app_id gets its own pool with storage budget, default royalties,
 * primary-sale commission, and moderation controls. This enables ticketing
 * platforms, certification issuers, and other verticals to operate
 * independently on the shared scarces contract.
 */

import {
  type SimpleActionResult,
  ComposeError,
  resolveScarcesTarget,
  nearToYocto,
  validateRoyalty,
} from './shared.js';

// ---------------------------------------------------------------------------
// App Registration & Config
// ---------------------------------------------------------------------------

/** Build a RegisterApp action — register a new app pool. */
export function buildRegisterAppAction(params: {
  appId: string;
  maxUserBytes?: number;
  defaultRoyalty?: Record<string, number>;
  primarySaleBps?: number;
  curated?: boolean;
  metadata?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (params.defaultRoyalty) {
    const err = validateRoyalty(params.defaultRoyalty);
    if (err) throw new ComposeError(400, err);
  }
  if (params.primarySaleBps != null && params.primarySaleBps > 5000)
    throw new ComposeError(400, 'primarySaleBps cannot exceed 5000 (50%)');
  return {
    action: {
      type: 'register_app',
      app_id: params.appId,
      // AppConfig is #[serde(flatten)] — fields are at root level
      ...(params.maxUserBytes != null && {
        max_user_bytes: params.maxUserBytes,
      }),
      ...(params.defaultRoyalty && {
        default_royalty: params.defaultRoyalty,
      }),
      ...(params.primarySaleBps != null && {
        primary_sale_bps: params.primarySaleBps,
      }),
      ...(params.curated != null && { curated: params.curated }),
      ...(params.metadata != null && { metadata: params.metadata }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a SetAppConfig action — update an existing app pool configuration. */
export function buildSetAppConfigAction(params: {
  appId: string;
  maxUserBytes?: number;
  defaultRoyalty?: Record<string, number>;
  primarySaleBps?: number;
  curated?: boolean;
  metadata?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (params.defaultRoyalty) {
    const err = validateRoyalty(params.defaultRoyalty);
    if (err) throw new ComposeError(400, err);
  }
  if (params.primarySaleBps != null && params.primarySaleBps > 5000)
    throw new ComposeError(400, 'primarySaleBps cannot exceed 5000 (50%)');
  return {
    action: {
      type: 'set_app_config',
      app_id: params.appId,
      ...(params.maxUserBytes != null && {
        max_user_bytes: params.maxUserBytes,
      }),
      ...(params.defaultRoyalty && {
        default_royalty: params.defaultRoyalty,
      }),
      ...(params.primarySaleBps != null && {
        primary_sale_bps: params.primarySaleBps,
      }),
      ...(params.curated != null && { curated: params.curated }),
      ...(params.metadata != null && { metadata: params.metadata }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Pool Funding
// ---------------------------------------------------------------------------

/** Build a FundAppPool action — add NEAR to an app pool's storage balance. */
export function buildFundAppPoolAction(params: {
  appId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  return {
    action: { type: 'fund_app_pool', app_id: params.appId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a WithdrawAppPool action — withdraw NEAR from an app pool. */
export function buildWithdrawAppPoolAction(params: {
  appId: string;
  amountNear: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (!params.amountNear) throw new ComposeError(400, 'Missing amountNear');
  return {
    action: {
      type: 'withdraw_app_pool',
      app_id: params.appId,
      amount: nearToYocto(params.amountNear),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Ownership & Moderation
// ---------------------------------------------------------------------------

/** Build a TransferAppOwnership action. */
export function buildTransferAppOwnershipAction(params: {
  appId: string;
  newOwner: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (!params.newOwner) throw new ComposeError(400, 'Missing newOwner');
  return {
    action: {
      type: 'transfer_app_ownership',
      app_id: params.appId,
      new_owner: params.newOwner,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build an AddModerator action. */
export function buildAddModeratorAction(params: {
  appId: string;
  accountId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (!params.accountId) throw new ComposeError(400, 'Missing accountId');
  return {
    action: {
      type: 'add_moderator',
      app_id: params.appId,
      account_id: params.accountId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a RemoveModerator action. */
export function buildRemoveModeratorAction(params: {
  appId: string;
  accountId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (!params.accountId) throw new ComposeError(400, 'Missing accountId');
  return {
    action: {
      type: 'remove_moderator',
      app_id: params.appId,
      account_id: params.accountId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a BanCollection action — moderator bans a collection under their app. */
export function buildBanCollectionAction(params: {
  appId: string;
  collectionId: string;
  reason?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'ban_collection',
      app_id: params.appId,
      collection_id: params.collectionId,
      ...(params.reason && { reason: params.reason }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build an UnbanCollection action. */
export function buildUnbanCollectionAction(params: {
  appId: string;
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'unban_collection',
      app_id: params.appId,
      collection_id: params.collectionId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Storage & Admin
// ---------------------------------------------------------------------------

/** Build a StorageDeposit action — deposit storage for an account. */
export function buildStorageDepositAction(params: {
  accountId?: string;
  targetAccount?: string;
}): SimpleActionResult {
  return {
    action: {
      type: 'storage_deposit',
      ...(params.accountId && { account_id: params.accountId }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a StorageWithdraw action — withdraw excess storage balance. */
export function buildStorageWithdrawAction(params: {
  targetAccount?: string;
}): SimpleActionResult {
  return {
    action: { type: 'storage_withdraw' },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a WithdrawPlatformStorage action — platform owner withdraws storage fees. */
export function buildWithdrawPlatformStorageAction(params: {
  amountNear: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.amountNear) throw new ComposeError(400, 'Missing amountNear');
  return {
    action: {
      type: 'withdraw_platform_storage',
      amount: nearToYocto(params.amountNear),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a SetSpendingCap action — set per-tx spending limit for the caller. */
export function buildSetSpendingCapAction(params: {
  capNear?: string | null;
  targetAccount?: string;
}): SimpleActionResult {
  return {
    action: {
      type: 'set_spending_cap',
      cap: params.capNear ? nearToYocto(params.capNear) : null,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}
