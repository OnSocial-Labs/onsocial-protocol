/**
 * Compose: NEP-178 Approval management — approve, revoke, revoke-all.
 *
 * These are standard NFT approval operations. The `msg` field on approve
 * enables cross-contract marketplace flows (e.g. listing on external marketplace).
 */

import {
  type SimpleActionResult,
  ComposeError,
  resolveScarcesTarget,
} from './shared.js';

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------

/** Build an ApproveScarce action — approve an account to transfer a specific token. */
export function buildApproveAction(params: {
  tokenId: string;
  accountId: string;
  msg?: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.accountId) throw new ComposeError(400, 'Missing accountId');
  return {
    action: {
      type: 'approve_scarce',
      token_id: params.tokenId,
      account_id: params.accountId,
      ...(params.msg != null && { msg: params.msg }),
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/** Build a RevokeScarce action — revoke a specific account's approval. */
export function buildRevokeApprovalAction(params: {
  tokenId: string;
  accountId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  if (!params.accountId) throw new ComposeError(400, 'Missing accountId');
  return {
    action: {
      type: 'revoke_scarce',
      token_id: params.tokenId,
      account_id: params.accountId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}

/** Build a RevokeAllScarce action — revoke all approvals on a token. */
export function buildRevokeAllApprovalsAction(params: {
  tokenId: string;
  targetAccount?: string;
}): SimpleActionResult {
  if (!params.tokenId) throw new ComposeError(400, 'Missing tokenId');
  return {
    action: {
      type: 'revoke_all_scarce',
      token_id: params.tokenId,
    },
    targetAccount: resolveScarcesTarget(params.targetAccount),
  };
}
