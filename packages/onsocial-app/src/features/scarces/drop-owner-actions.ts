import type { NearWalletBase } from '@hot-labs/near-connect';
import type { RelayResponse } from '@onsocial/sdk';
import type { CollectionStatus } from '@/features/scarces/collections-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';

/** Pause minting on a live / upcoming drop. */
export function canPauseDrop(status: CollectionStatus | null | undefined): boolean {
  return status === 'live' || status === 'upcoming';
}

/** Resume a paused drop. */
export function canResumeDrop(status: CollectionStatus | null | undefined): boolean {
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
