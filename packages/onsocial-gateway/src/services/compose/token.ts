/**
 * Compose: Token lifecycle — transfer, burn, renew, redeem, revoke, refund.
 *
 * All builders produce a `SimpleActionResult` (action JSON + targetAccount).
 * The gateway relays via intent auth; the relayer handles wNEAR deposits
 * and NEAR Intents so users never need a wallet confirmation.
 */

import {
  type SimpleActionResult,
  ComposeError,
  resolveScarcesTarget,
} from './shared.js';

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

/** Build a TransferScarce action — transfer a Scarce to another account. */
export function buildTransferAction(params: {
  tokenId: string;
  receiverId: string;
  memo?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.receiverId) throw new ComposeError(400, 'Missing receiverId');
  return {
    action: {
      type: 'transfer_scarce',
      token_id: params.tokenId,
      receiver_id: params.receiverId,
      ...(params.memo && { memo: params.memo }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a BatchTransfer action — transfer multiple Scarces in one tx. */
export function buildBatchTransferAction(params: {
  transfers: Array<{
    receiver_id: string;
    token_id: string;
    memo?: string;
  }>;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.transfers?.length)
    throw new ComposeError(
      400,
      'transfers array is required and must not be empty'
    );
  for (const t of params.transfers) {
    if (!t.token_id)
      throw new ComposeError(400, 'Each transfer must have token_id');
    if (!t.receiver_id)
      throw new ComposeError(400, 'Each transfer must have receiver_id');
  }
  return {
    action: {
      type: 'batch_transfer',
      transfers: params.transfers,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Burn
// ---------------------------------------------------------------------------

/** Build a BurnScarce action — permanently destroy a token. */
export function buildBurnAction(params: {
  tokenId: string;
  collectionId?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: {
      type: 'burn_scarce',
      token_id: params.tokenId,
      ...(params.collectionId && { collection_id: params.collectionId }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Renew
// ---------------------------------------------------------------------------

/** Build a RenewToken action — extend expiry on a renewable collection token. */
export function buildRenewTokenAction(params: {
  tokenId: string;
  collectionId: string;
  newExpiresAt: number;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  if (!params.newExpiresAt) throw new ComposeError(400, 'Missing newExpiresAt');
  return {
    action: {
      type: 'renew_token',
      token_id: params.tokenId,
      collection_id: params.collectionId,
      new_expires_at: params.newExpiresAt,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Redeem
// ---------------------------------------------------------------------------

/** Build a RedeemToken action — mark a token as redeemed (e.g. ticket scan). */
export function buildRedeemTokenAction(params: {
  tokenId: string;
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'redeem_token',
      token_id: params.tokenId,
      collection_id: params.collectionId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/** Build a RevokeToken action — invalidate/burn a token (issuer privilege). */
export function buildRevokeTokenAction(params: {
  tokenId: string;
  collectionId: string;
  memo?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'revoke_token',
      token_id: params.tokenId,
      collection_id: params.collectionId,
      ...(params.memo && { memo: params.memo }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Claim Refund
// ---------------------------------------------------------------------------

/** Build a ClaimRefund action — claim refund for a cancelled collection token. */
export function buildClaimRefundAction(params: {
  tokenId: string;
  collectionId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.collectionId) throw new ComposeError(400, 'Missing collectionId');
  return {
    action: {
      type: 'claim_refund',
      token_id: params.tokenId,
      collection_id: params.collectionId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}
