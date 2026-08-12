import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import { accountIdsEqual } from '@/lib/account-match';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

/** Live door-staff roster + creator from the scarces contract. */
export async function fetchCollectionRedeemers(collectionId: string): Promise<{
  creatorId: string | null;
  redeemers: string[];
} | null> {
  const id = collectionId.trim();
  if (!id) return null;
  try {
    const collection = await viewNearContract<{
      creator_id?: string;
      redeemers?: string[] | null;
    } | null>(SCARCES_CONTRACT, 'get_collection', {
      collection_id: id,
    });
    if (!collection) return null;
    const creatorId = collection.creator_id?.trim() || null;
    const redeemers = Array.isArray(collection.redeemers)
      ? collection.redeemers
          .map((account) => account.trim())
          .filter(Boolean)
      : [];
    return { creatorId, redeemers };
  } catch {
    return null;
  }
}

/** True when the account is creator or listed redeemer. */
export async function fetchIsCollectionRedeemer(
  collectionId: string,
  accountId: string
): Promise<boolean> {
  const id = collectionId.trim();
  const account = accountId.trim();
  if (!id || !account) return false;
  try {
    const ok = await viewNearContract<boolean>(
      SCARCES_CONTRACT,
      'is_collection_redeemer',
      {
        collection_id: id,
        account_id: account,
      }
    );
    return Boolean(ok);
  } catch {
    const roster = await fetchCollectionRedeemers(id);
    if (!roster) return false;
    if (roster.creatorId && accountIdsEqual(roster.creatorId, account)) {
      return true;
    }
    return roster.redeemers.some((entry) => accountIdsEqual(entry, account));
  }
}

export const MAX_COLLECTION_REDEEMERS = 20;
