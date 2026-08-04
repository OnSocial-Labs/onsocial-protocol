import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { marketMediumLabel } from '@/features/market/market-medium';
import { APP_MARKET_PATH, collectionPath } from '@/lib/app-routes';

/** Max holdings cards in the portfolio Collectibles rail. */
export const PAGE_DRAWER_HOLDINGS_PEEK = 6;

export interface PortfolioHoldingPeek {
  tokenId: string;
  title: string;
  mediaUrl: string | null;
  collectionId: string | null;
  mediumKind: string | null;
  /** Deep link into the drop (or market fallback). */
  href: string;
  /** Primary use action for this medium. */
  actionLabel: string;
  /** Short medium label for the badge, when known. */
  kindLabel: string | null;
}

/** Holder-facing primary action for a medium kind. */
export function holdingsActionLabel(
  mediumKind: string | null | undefined
): string {
  switch ((mediumKind ?? '').trim().toLowerCase()) {
    case 'writing':
      return 'Read';
    case 'music':
      return 'Play';
    case 'ticket':
      return 'Show pass';
    case 'coupon':
      return 'Redeem';
    case 'membership':
      return 'Open pass';
    default:
      return 'Open';
  }
}

export function holdingsKindLabel(
  mediumKind: string | null | undefined
): string | null {
  return marketMediumLabel(mediumKind);
}

export function holdingsHrefForOwned(item: {
  tokenId: string;
  collectionId?: string | null;
  sourcePostPath?: string;
}): string {
  const collectionId =
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId);
  if (collectionId) return collectionPath(collectionId);
  const postPath = item.sourcePostPath?.trim();
  if (postPath) {
    return postPath.startsWith('/') ? postPath : `/${postPath}`;
  }
  return APP_MARKET_PATH;
}

export function toPortfolioHoldingPeek(
  item: OwnedScarceItem
): PortfolioHoldingPeek {
  const mediumKind = item.mediumKind?.trim().toLowerCase() || null;
  const collectionId =
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId);
  return {
    tokenId: item.tokenId,
    title: item.title,
    mediaUrl: item.mediaUrl ?? null,
    collectionId,
    mediumKind,
    href: holdingsHrefForOwned(item),
    actionLabel: holdingsActionLabel(mediumKind),
    kindLabel: holdingsKindLabel(mediumKind),
  };
}
