/**
 * Compose: Collection management — lifecycle operations beyond creation.
 *
 * Covers pricing, timing, minting, airdrop, pause/resume, allowlists,
 * metadata, cancellation, refund withdrawal, and buyer purchases.
 */

import {
  type SimpleActionResult,
  ComposeError,
  resolveScarcesTarget,
  nearToYocto,
} from './shared.js';

// ---------------------------------------------------------------------------
// Pricing & Timing
// ---------------------------------------------------------------------------

/** Build an UpdateCollectionPrice action. */
export function buildUpdateCollectionPriceAction(params: {
  collectionId: string;
  newPriceNear: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.newPriceNear) throw new ComposeError(400, 'Missing newPriceNear');
  return {
    action: {
      type: 'update_collection_price',
      collection_id: params.collectionId,
      new_price_near: nearToYocto(params.newPriceNear),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build an UpdateCollectionTiming action. */
export function buildUpdateCollectionTimingAction(params: {
  collectionId: string;
  startTime?: number | null;
  endTime?: number | null;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'update_collection_timing',
      collection_id: params.collectionId,
      start_time: params.startTime ?? null,
      end_time: params.endTime ?? null,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

/** Build a MintFromCollection action — creator mints tokens from their collection. */
export function buildMintFromCollectionAction(params: {
  collectionId: string;
  quantity: number;
  receiverId?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  const qty = params.quantity ?? 1;
  if (qty < 1 || qty > 10) throw new ComposeError(400, 'Quantity must be 1-10');
  return {
    action: {
      type: 'mint_from_collection',
      collection_id: params.collectionId,
      quantity: qty,
      ...(params.receiverId && { receiver_id: params.receiverId }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build an AirdropFromCollection action — mint tokens to multiple receivers. */
export function buildAirdropFromCollectionAction(params: {
  collectionId: string;
  receivers: string[];
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.receivers?.length)
    throw new ComposeError(
      400,
      'receivers array is required and must not be empty'
    );
  return {
    action: {
      type: 'airdrop_from_collection',
      collection_id: params.collectionId,
      receivers: params.receivers,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Purchase from Collection
// ---------------------------------------------------------------------------

/** Build a PurchaseFromCollection action — buyer purchases tokens from a collection. */
export function buildPurchaseFromCollectionAction(params: {
  collectionId: string;
  quantity: number;
  maxPricePerTokenNear: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.maxPricePerTokenNear)
    throw new ComposeError(400, 'Missing maxPricePerTokenNear');
  const qty = params.quantity ?? 1;
  if (qty < 1 || qty > 10) throw new ComposeError(400, 'Quantity must be 1-10');
  return {
    action: {
      type: 'purchase_from_collection',
      collection_id: params.collectionId,
      quantity: qty,
      max_price_per_token: nearToYocto(params.maxPricePerTokenNear),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle: Pause / Resume / Delete / Cancel
// ---------------------------------------------------------------------------

/** Build a PauseCollection action. */
export function buildPauseCollectionAction(params: {
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: { type: 'pause_collection', collection_id: params.collectionId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a ResumeCollection action. */
export function buildResumeCollectionAction(params: {
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: { type: 'resume_collection', collection_id: params.collectionId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a DeleteCollection action — only if zero minted. */
export function buildDeleteCollectionAction(params: {
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: { type: 'delete_collection', collection_id: params.collectionId },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a CancelCollection action — enables refund flow for holders. */
export function buildCancelCollectionAction(params: {
  collectionId: string;
  refundPerTokenNear: string;
  refundDeadlineNs?: number;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.refundPerTokenNear)
    throw new ComposeError(400, 'Missing refundPerTokenNear');
  return {
    action: {
      type: 'cancel_collection',
      collection_id: params.collectionId,
      refund_per_token: nearToYocto(params.refundPerTokenNear),
      ...(params.refundDeadlineNs != null && {
        refund_deadline_ns: params.refundDeadlineNs,
      }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a WithdrawUnclaimedRefunds action. */
export function buildWithdrawUnclaimedRefundsAction(params: {
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'withdraw_unclaimed_refunds',
      collection_id: params.collectionId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

/** Build a SetAllowlist action — set/replace entire allowlist for a collection. */
export function buildSetAllowlistAction(params: {
  collectionId: string;
  entries: Array<{ account_id: string; allocation: number }>;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.entries?.length)
    throw new ComposeError(
      400,
      'entries array is required and must not be empty'
    );
  return {
    action: {
      type: 'set_allowlist',
      collection_id: params.collectionId,
      entries: params.entries,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a RemoveFromAllowlist action. */
export function buildRemoveFromAllowlistAction(params: {
  collectionId: string;
  accounts: string[];
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.accounts?.length)
    throw new ComposeError(
      400,
      'accounts array is required and must not be empty'
    );
  return {
    action: {
      type: 'remove_from_allowlist',
      collection_id: params.collectionId,
      accounts: params.accounts,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** Build a SetCollectionMetadata action. */
export function buildSetCollectionMetadataAction(params: {
  collectionId: string;
  metadata: string | null;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'set_collection_metadata',
      collection_id: params.collectionId,
      metadata: params.metadata,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a SetCollectionAppMetadata action — app-scoped metadata. */
export function buildSetCollectionAppMetadataAction(params: {
  appId: string;
  collectionId: string;
  metadata: string | null;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.appId) throw new ComposeError(400, 'Missing appId');
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'set_collection_app_metadata',
      app_id: params.appId,
      collection_id: params.collectionId,
      metadata: params.metadata,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}
