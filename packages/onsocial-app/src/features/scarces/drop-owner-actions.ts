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
import { mergeEventEndsIntoCollectionMetadata } from '@/features/scarces/ticket-event-meta';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

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

/** Organiser rain-day: postpone entry / redeem on a renewable ticket drop. */
export function canExtendTicketEntry(input: {
  kind?: string | null;
  renewable?: boolean | null;
  status?: CollectionStatus | null;
}): boolean {
  if (input.kind !== 'ticket') return false;
  if (!input.renewable) return false;
  if (input.status === 'cancelled') return false;
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

async function listCollectionTokenIds(collectionId: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 64;
  let fromIndex = 0;
  for (;;) {
    const page = await viewNearContract<
      Array<{ token_id?: string; tokenId?: string }>
    >(SCARCES_CONTRACT, 'nft_tokens_for_collection', {
      collection_id: collectionId,
      from_index: fromIndex,
      limit: pageSize,
    });
    const rows = Array.isArray(page) ? page : [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const id = (row.token_id ?? row.tokenId ?? '').trim();
      if (id) ids.push(id);
    }
    if (rows.length < pageSize) break;
    fromIndex += rows.length;
  }
  return ids;
}

/**
 * Postpone ticket entry: renew minted tokens + stamp collection metadata
 * so Facts/Door show the new event end. `newExpiresAtMs` is wall-clock ms.
 */
export async function extendTicketEntryAccess(
  accountId: string,
  wallet: NearWalletBase,
  input: {
    collectionId: string;
    newExpiresAtMs: number;
  }
): Promise<{ responses: RelayResponse[]; eventEndsAtMs: number }> {
  const eventEndsAtMs = Math.floor(input.newExpiresAtMs);
  if (!Number.isFinite(eventEndsAtMs) || eventEndsAtMs <= Date.now()) {
    throw new Error('New entry end must be in the future.');
  }

  const client = createAppScarcesWalletClient(accountId, wallet);
  const responses: RelayResponse[] = [];

  const tokenIds = await listCollectionTokenIds(input.collectionId);
  if (tokenIds.length > 0) {
    const newExpiresAtNs = eventEndsAtMs * 1_000_000;
    const renewResponses = await client.scarces.tokens.renewMany(
      input.collectionId,
      tokenIds,
      newExpiresAtNs
    );
    responses.push(...renewResponses);
  }

  const record = await viewNearContract<{
    metadata?: string | null;
  } | null>(SCARCES_CONTRACT, 'get_collection', {
    collection_id: input.collectionId,
  });
  const nextMetadata = mergeEventEndsIntoCollectionMetadata(
    record?.metadata ?? null,
    eventEndsAtMs
  );
  responses.push(
    await client.scarces.collections.setMetadata(
      input.collectionId,
      nextMetadata
    )
  );

  return { responses, eventEndsAtMs };
}
