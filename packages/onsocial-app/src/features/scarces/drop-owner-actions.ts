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

/**
 * Organiser can postpone a renewable ticket while the listed end is still
 * ahead. A missing end stays allowed — the contract can still set one.
 * `now >= end` matches the door: closed at that instant.
 */
export function canExtendTicketEntry(input: {
  kind?: string | null;
  renewable?: boolean | null;
  status?: CollectionStatus | null;
  eventEndsAtMs?: number | null;
  nowMs?: number;
}): boolean {
  if (input.kind !== 'ticket') return false;
  if (!input.renewable) return false;
  if (input.status === 'cancelled') return false;
  const end = input.eventEndsAtMs;
  const now = input.nowMs ?? Date.now();
  if (end != null && Number.isFinite(end) && end > 0 && now >= end)
    return false;
  return true;
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
      ...(depositYocto === '0' ? {} : { depositYocto }),
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

/**
 * Postpone ticket entry with one wallet confirmation.
 * The contract stores the new end on the collection (door + Facts) and
 * on the mint template (tickets bought after this). `newExpiresAtMs` is
 * wall-clock ms.
 */
export async function extendTicketEntryAccess(
  accountId: string,
  wallet: NearWalletBase,
  input: {
    collectionId: string;
    newExpiresAtMs: number;
    newStartsAtMs?: number | null;
  }
): Promise<{ responses: RelayResponse[]; eventEndsAtMs: number }> {
  const eventEndsAtMs = Math.floor(input.newExpiresAtMs);
  if (!Number.isFinite(eventEndsAtMs) || eventEndsAtMs <= Date.now()) {
    throw new Error('New entry end must be in the future.');
  }
  const eventStartsAtMs =
    input.newStartsAtMs != null ? Math.floor(input.newStartsAtMs) : undefined;
  if (
    eventStartsAtMs != null &&
    (!Number.isFinite(eventStartsAtMs) ||
      eventStartsAtMs <= Date.now() ||
      eventStartsAtMs >= eventEndsAtMs)
  ) {
    throw new Error('New start must be in the future and before the new end.');
  }

  const client = createAppScarcesWalletClient(accountId, wallet);
  const response = await client.scarces.collections.updateTemplateExpiry(
    input.collectionId,
    eventEndsAtMs,
    eventStartsAtMs
  );

  return { responses: [response], eventEndsAtMs };
}
