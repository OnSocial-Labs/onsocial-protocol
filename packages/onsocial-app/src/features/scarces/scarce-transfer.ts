import type { OwnedScarceItem } from '@/features/market/market-listings';
import type { NearAccountStatus } from '@/hooks/use-near-account-status';
import { accountIdsEqual } from '@/lib/account-match';
import { normalizeNearAccountId } from '@/lib/app-near-account';

/** Explicitly burnable drops only. Unknown stays hidden until the collection says yes. */
export function ownedScarceCanBurn(
  item: Pick<OwnedScarceItem, 'burnable' | 'listingKind' | 'bidCount'>
): boolean {
  if (item.burnable !== true) return false;
  if (item.listingKind === 'auction' && (item.bidCount ?? 0) > 0) return false;
  return true;
}

/** Soulbound drops stay put. Live auctions with bids stay until they settle. */
export function ownedScarceCanTransfer(
  item: Pick<OwnedScarceItem, 'transferable' | 'listingKind' | 'bidCount'>
): boolean {
  if (item.transferable === false) return false;
  if (item.listingKind === 'auction' && (item.bidCount ?? 0) > 0) return false;
  return true;
}

export function scarceTransferReady(input: {
  status: NearAccountStatus;
  receiverId: string;
  ownerId: string | null;
}): boolean {
  const receiver = normalizeNearAccountId(input.receiverId);
  if (!receiver || input.status !== 'found') return false;
  if (input.ownerId && accountIdsEqual(receiver, input.ownerId)) return false;
  return true;
}
