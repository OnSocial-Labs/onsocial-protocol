import {
  collectionIdFromTokenId,
  editionSeatFromTokenId,
  resolveTokenDisplayTitle,
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
/** Max grouped rows in the drawer Collection preview before See all. */
export const PAGE_DRAWER_COLLECTION_PREVIEW_ROWS = 24;

export interface PortfolioHoldingPeek {
  tokenId: string;
  title: string;
  mediaUrl: string | null;
  collectionId: string | null;
  /** Drop creator account when known. */
  creatorId?: string | null;
  /** Edition seat from `collectionId:n` tokens. */
  editionSeat?: number | null;
  mediumKind: string | null;
  /** Audio release format when known. */
  audioFormat?: 'single' | 'album' | 'podcast' | null;
  /** Discovery facets (genres / subjects). */
  facets?: string[];
  /** Deep link into Collectibles / drop / source post when known. */
  href: string;
  /** Primary use action for this medium. */
  actionLabel: string;
  /** Short medium label for the badge. */
  kindLabel: string;
  /** Resale listing state when this token is on Market. */
  listingKind?: 'fixed' | 'auction' | null;
  listedPriceNear?: string | null;
}

/** Holder-facing primary action for a medium kind. */
export function holdingsActionLabel(
  mediumKind: string | null | undefined
): string {
  const key = (mediumKind ?? '').trim().toLowerCase();
  if (isAudioMediumKind(key)) return 'Play';
  switch (key) {
    case 'writing':
    case 'book':
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
): string {
  return marketMediumLabel(mediumKind) ?? 'Collectible';
}

/** Drop editions tagged `thought` from post mint still read as Collectible in lists. */
export function displayKindLabelForOwned(
  mediumKind: string | null,
  tokenId: string,
  collectionId: string | null
): string {
  const kind = mediumKind?.trim().toLowerCase() || null;
  if (kind === 'thought' && collectionId && !tokenId.trim().startsWith('s:')) {
    return 'Collectible';
  }
  return holdingsKindLabel(kind);
}

function inferOwnedMediumKind(item: OwnedScarceItem): string | null {
  const kind = item.mediumKind?.trim().toLowerCase();
  if (kind) return kind;
  // Post mint scarces only — drop editions can still carry sourcePostPath.
  if (item.tokenId.trim().startsWith('s:')) return 'thought';
  return null;
}

function displayTitleForOwnedHolding(item: OwnedScarceItem): string {
  const tokenId = item.tokenId.trim();
  const collectionId =
    item.collectionId?.trim() || collectionIdFromTokenId(tokenId);
  const raw = item.title?.trim() || '';
  const resolved = raw ? resolveTokenDisplayTitle(raw, tokenId) : '';

  if (
    resolved &&
    resolved !== 'Scarce' &&
    resolved !== tokenId &&
    !(collectionId && resolved === collectionId)
  ) {
    return resolved;
  }

  const description = item.description?.trim();
  if (description && description !== resolved) {
    return description.length > 72
      ? `${description.slice(0, 69)}…`
      : description;
  }

  if (resolved && resolved !== 'Scarce') {
    return resolved;
  }

  return 'Collectible';
}

export function toPortfolioHoldingPeek(
  item: OwnedScarceItem
): PortfolioHoldingPeek {
  const mediumKind = inferOwnedMediumKind(item);
  const collectionId =
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId);
  const editionSeat = editionSeatFromTokenId(item.tokenId);
  const creatorId = item.creatorId?.trim() || null;
  return {
    tokenId: item.tokenId,
    title: displayTitleForOwnedHolding(item),
    mediaUrl: item.mediaUrl ?? null,
    collectionId,
    ...(creatorId ? { creatorId } : {}),
    ...(editionSeat != null ? { editionSeat } : {}),
    mediumKind,
    ...(item.audioFormat !== undefined
      ? { audioFormat: item.audioFormat }
      : {}),
    ...(item.facets && item.facets.length > 0 ? { facets: item.facets } : {}),
    ...(item.listingKind
      ? {
          listingKind: item.listingKind,
          listedPriceNear: item.listedPriceNear ?? null,
        }
      : item.listedPriceNear?.trim()
        ? { listingKind: null, listedPriceNear: item.listedPriceNear }
        : {}),
    href:
      holdingsHrefForOwned({
        tokenId: item.tokenId,
        collectionId,
        sourcePostPath: item.sourcePostPath,
        postHref: item.postHref,
        mediumKind,
      }) ?? APP_COLLECTIBLES_PATH,
    actionLabel: holdingsActionLabel(mediumKind),
    kindLabel: displayKindLabelForOwned(mediumKind, item.tokenId, collectionId),
  };
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

/** Rail card that stands in for every owned edition of one collection. */
export type PortfolioHoldingRailCard = PortfolioHoldingPeek & {
  /** Owned editions represented by this card (1 = unique token). */
  editionCount: number;
};

/**
 * Collapse duplicate editions — two copies of the same collection rendered as
 * identical rows read as a bug, not a collection. Listed state folds in from
 * any edition in the group.
 */
export function groupHoldingsForRail(
  holdings: PortfolioHoldingPeek[]
): PortfolioHoldingRailCard[] {
  const byKey = new Map<string, PortfolioHoldingRailCard>();
  for (const item of holdings) {
    const key = item.collectionId ?? item.tokenId;
    const existing = byKey.get(key);
    if (existing) {
      existing.editionCount += 1;
      if (!existing.listedPriceNear?.trim() && item.listedPriceNear?.trim()) {
        existing.listingKind = item.listingKind ?? null;
        existing.listedPriceNear = item.listedPriceNear;
      }
      continue;
    }
    byKey.set(key, { ...item, editionCount: 1 });
  }
  return [...byKey.values()];
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
    'title' | 'kindLabel' | 'actionLabel' | 'tokenId' | 'creatorId'
  >,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.title,
    item.kindLabel,
    item.actionLabel,
    item.tokenId,
    item.creatorId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
