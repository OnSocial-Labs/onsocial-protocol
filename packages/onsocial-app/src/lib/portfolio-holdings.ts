import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import {
  isAudioMediumKind,
  marketMediumLabel,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import {
  APP_COLLECTIBLES_PATH,
  collectionPath,
  collectiblesPlayPath,
} from '@/lib/app-routes';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';

/** Max holdings cards in the portfolio Collectibles rail. */
export const PAGE_DRAWER_HOLDINGS_PEEK = 6;

export interface PortfolioHoldingPeek {
  tokenId: string;
  title: string;
  mediaUrl: string | null;
  collectionId: string | null;
  mediumKind: string | null;
  /** Audio release format when known. */
  audioFormat?: 'single' | 'album' | 'podcast' | null;
  /** Discovery facets (genres / subjects). */
  facets?: string[];
  /** Deep link into Collectibles / drop / source post when known. */
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
  const key = (mediumKind ?? '').trim().toLowerCase();
  if (isAudioMediumKind(key)) return 'Play';
  switch (key) {
    case 'writing':
      return 'Read';
    case 'video':
      return 'Watch';
    case 'ticket':
      return 'Show pass';
    case 'coupon':
      return 'Redeem';
    case 'membership':
      return 'Open pass';
    case 'thought':
    case 'art':
    default:
      return 'Open';
  }
}

export function holdingsKindLabel(
  mediumKind: string | null | undefined
): string | null {
  return marketMediumLabel(mediumKind);
}

/**
 * Where an owned scarce should open.
 * - Drop editions → Collectibles player / collection page
 * - Post scarces (`s:…`) → source post thread (same as Market listings)
 * - Never `/market` (same-page dead click that remounts and kills bg audio)
 */
export function holdingsHrefForOwned(item: {
  tokenId: string;
  collectionId?: string | null;
  sourcePostPath?: string;
  /** Resolved guild/personal thread href when already known. */
  postHref?: string | null;
  mediumKind?: string | null;
}): string | null {
  const collectionId =
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId);
  const medium = (item.mediumKind ?? '').trim().toLowerCase();
  // Audio / video holdings open the focused Collectibles player.
  if (collectionId && (isAudioMediumKind(medium) || medium === 'video')) {
    return collectiblesPlayPath(collectionId, { tokenId: item.tokenId });
  }
  // Writing holdings open the collection with the immersive reader.
  if (collectionId && (medium === 'writing' || medium === 'book')) {
    return collectionPath(collectionId, { read: true });
  }
  // Tickets / memberships / coupons open Show pass on the drop page.
  if (
    collectionId &&
    (medium === 'ticket' || medium === 'membership' || medium === 'coupon')
  ) {
    return collectionPath(collectionId, {
      pass: true,
      tokenId: item.tokenId,
    });
  }
  if (collectionId) return collectionPath(collectionId);
  const postHref =
    item.postHref?.trim() ||
    postHrefFromSourcePath(item.sourcePostPath) ||
    null;
  return postHref;
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
    ...(item.audioFormat !== undefined
      ? { audioFormat: item.audioFormat }
      : {}),
    ...(item.facets && item.facets.length > 0 ? { facets: item.facets } : {}),
    href:
      holdingsHrefForOwned({
        tokenId: item.tokenId,
        collectionId,
        sourcePostPath: item.sourcePostPath,
        postHref: item.postHref,
        mediumKind,
      }) ?? APP_COLLECTIBLES_PATH,
    actionLabel: holdingsActionLabel(mediumKind),
    kindLabel: holdingsKindLabel(mediumKind),
  };
}

/** Kind-tab filter for the Collectibles hub (unknown kinds only appear in All). */
export function filterHoldingsByMedium<
  T extends { mediumKind: string | null },
>(items: T[], medium: MarketMediumFilter): T[] {
  if (medium === 'all') return items;
  if (medium === 'audio') {
    return items.filter((item) => isAudioMediumKind(item.mediumKind));
  }
  return items.filter((item) => item.mediumKind === medium);
}

/** Client search for the Collectibles hub search field. */
export function holdingsMatchQuery(
  item: Pick<
    PortfolioHoldingPeek,
    'title' | 'kindLabel' | 'actionLabel' | 'tokenId'
  >,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [item.title, item.kindLabel, item.actionLabel, item.tokenId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
