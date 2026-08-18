import type { NearWalletBase } from '@hot-labs/near-connect';
import type { RelayResponse } from '@onsocial/sdk';
import type { CollectionStatus } from '@/features/scarces/collections-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  hasUnclaimedRefundPool,
  isRefundClaimWindowClosed,
  refundClaimDaysToNs,
  refundPoolDepositYocto,
} from '@/features/scarces/drop-refund';

/** Pause minting on a live / upcoming drop. */
export function canPauseDrop(
  status: CollectionStatus | null | undefined
): boolean {
  return status === 'live' || status === 'upcoming';
}

/** Resume a paused drop. */
export function canResumeDrop(
  status: CollectionStatus | null | undefined
): boolean {
  return status === 'paused';
}

/**
 * Delete only when nothing has been minted — contract rejects otherwise.
 * Fair for scrubbing blank / mistaken drops.
 */
export function canDeleteDrop(
  mintedCount: number | null | undefined,
  status: CollectionStatus | null | undefined
): boolean {
  if (status === 'cancelled') return false;
  return (mintedCount ?? 0) === 0;
}

/** Cancel + fund refunds — any non-cancelled drop the owner still controls. */
export function canCancelDrop(
  status: CollectionStatus | null | undefined
): boolean {
  return status != null && status !== 'cancelled';
}

/** After the claim window, reclaim leftover pool NEAR. */
export function canWithdrawUnclaimedRefunds(input: {
  cancelled: boolean;
  refundDeadlineMs?: number | null;
  refundPoolYocto?: string | null;
  nowMs?: number;
}): boolean {
  if (!input.cancelled) return false;
  if (!hasUnclaimedRefundPool(input.refundPoolYocto)) return false;
  return isRefundClaimWindowClosed(input.refundDeadlineMs, input.nowMs);
}

export async function pauseDropCollection(
  accountId: string,
  wallet: NearWalletBase,
  collectionId: string
): Promise<RelayResponse> {
  const client = createAppScarcesWalletClient(accountId, wallet);
  return client.scarces.collections.pause(collectionId);
}

export async function resumeDropCollection(
  accountId: string,
  wallet: NearWalletBase,
  collectionId: string
): Promise<RelayResponse> {
  const client = createAppScarcesWalletClient(accountId, wallet);
  return client.scarces.collections.resume(collectionId);
}

export async function deleteDropCollection(
  accountId: string,
  wallet: NearWalletBase,
  collectionId: string
): Promise<RelayResponse> {
  const client = createAppScarcesWalletClient(accountId, wallet);
  return client.scarces.collections.delete(collectionId);
}

export async function cancelDropCollection(
  accountId: string,
  wallet: NearWalletBase,
  input: {
    collectionId: string;
    refundPerTokenNear: string;
    refundableCount: number;
    claimDays: number;
  }
): Promise<RelayResponse> {
  const client = createAppScarcesWalletClient(accountId, wallet);
  const depositYocto = refundPoolDepositYocto(
    input.refundPerTokenNear,
    input.refundableCount
  );
  return client.scarces.collections.cancel(
    input.collectionId,
    input.refundPerTokenNear,
    {
      refundDeadlineNs: refundClaimDaysToNs(input.claimDays),
      ...(depositYocto === '0'
        ? {}
        : { depositYocto }),
    }
  );
}

export async function withdrawUnclaimedDropRefunds(
  accountId: string,
  wallet: NearWalletBase,
  collectionId: string
): Promise<RelayResponse> {
  const client = createAppScarcesWalletClient(accountId, wallet);
  return client.scarces.collections.withdrawUnclaimedRefunds(collectionId);
}

export async function claimDropTokenRefund(
  accountId: string,
  wallet: NearWalletBase,
  tokenId: string,
  collectionId: string
): Promise<RelayResponse> {
  const client = createAppScarcesWalletClient(accountId, wallet);
  return client.scarces.tokens.claimRefund(tokenId, collectionId);
}
