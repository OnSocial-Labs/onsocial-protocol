import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import type { NearAccountStatus } from '@/hooks/use-near-account-status';
import { accountIdsEqual } from '@/lib/account-match';
import { normalizeNearAccountId } from '@/lib/app-near-account';

/** Now-playing identity so Transfer joins the same audio as Buy and Sell. */
export interface ScarceTransferClipSession {
  collectionId: string;
  title: string;
  creatorId?: string;
  seriesId?: string;
  seriesTitle?: string;
  audioFormat?: NonNullable<OwnedScarceItem['audioFormat']>;
  facets?: string[];
}

/**
 * Drop id the clip player uses to bind the shared audio element.
 * Post scarces (`s:`) have no collection session.
 */
export function scarceTransferClipSession(
  item: Pick<
    OwnedScarceItem,
    | 'tokenId'
    | 'title'
    | 'collectionId'
    | 'creatorId'
    | 'seriesId'
    | 'seriesTitle'
    | 'audioFormat'
    | 'facets'
  >
): ScarceTransferClipSession | null {
  const collectionId =
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId);
  if (!collectionId) return null;
  const session: ScarceTransferClipSession = {
    collectionId,
    title: item.title?.trim() || 'Scarce',
  };
  const creatorId = item.creatorId?.trim();
  if (creatorId) session.creatorId = creatorId;
  const seriesId = item.seriesId?.trim();
  if (seriesId) session.seriesId = seriesId;
  const seriesTitle = item.seriesTitle?.trim();
  if (seriesTitle) session.seriesTitle = seriesTitle;
  if (item.audioFormat) session.audioFormat = item.audioFormat;
  if (item.facets?.length) session.facets = item.facets;
  return session;
}

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
