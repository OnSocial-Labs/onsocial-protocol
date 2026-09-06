import {
  collectionIdFromTokenId,
  editionSeatFromTokenId,
  resolveTokenDisplayTitle,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import {
  MARKET_MEDIUM_FILTERS,
  isAudioMediumKind,
  marketMediumLabel,
  parseMarketMediumFilter,
  type MarketMediumFilter,
} from '@/features/market/market-medium';
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_COLLECTIBLES_PATH,
  collectionPath,
  collectiblesPlayPath,
} from '@/lib/app-routes';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';

/** Vault filter id when a holding has no drop creator. */
export const COLLECTIBLES_CREATOR_OTHER = 'other';

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
  /** Series id when the drop is grouped under a series. */
  seriesId?: string | null;
  /** Series display title when stamped. */
  seriesTitle?: string | null;
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
    case 'issue':
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
    ...(item.seriesId?.trim() ? { seriesId: item.seriesId.trim() } : {}),
    ...(item.seriesTitle?.trim()
      ? { seriesTitle: item.seriesTitle.trim() }
      : {}),
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

export function holdingsCreatorKey(
  creatorId?: string | null
): string {
  return creatorId?.trim() || COLLECTIBLES_CREATOR_OTHER;
}

export function holdingsSeriesKey(
  item: Pick<PortfolioHoldingPeek, 'seriesId' | 'seriesTitle'>
): string | null {
  const id = item.seriesId?.trim();
  if (id) return id;
  const title = item.seriesTitle?.trim();
  return title ? title.toLowerCase() : null;
}

export type CollectiblesLibraryDrop = PortfolioHoldingRailCard;

export interface CollectiblesLibrarySeriesGroup {
  /** Null when these drops are not in a series. */
  seriesKey: string | null;
  seriesId: string | null;
  seriesTitle: string | null;
  drops: CollectiblesLibraryDrop[];
}

export interface CollectiblesLibraryCreatorGroup {
  creatorKey: string;
  creatorId: string | null;
  series: CollectiblesLibrarySeriesGroup[];
}

/**
 * Library shelf: creator, then series, then edition-collapsed drops.
 * Creators and series keep first-seen order (newest holdings first).
 */
export function groupHoldingsLibrary(
  holdings: PortfolioHoldingPeek[]
): CollectiblesLibraryCreatorGroup[] {
  const rail = groupHoldingsForRail(holdings);
  const creators = new Map<
    string,
    {
      group: CollectiblesLibraryCreatorGroup;
      seriesMap: Map<string, CollectiblesLibrarySeriesGroup>;
      ungrouped: CollectiblesLibraryDrop[];
    }
  >();

  for (const drop of rail) {
    const creatorKey = holdingsCreatorKey(drop.creatorId);
    let bucket = creators.get(creatorKey);
    if (!bucket) {
      bucket = {
        group: {
          creatorKey,
          creatorId: drop.creatorId?.trim() || null,
          series: [],
        },
        seriesMap: new Map(),
        ungrouped: [],
      };
      creators.set(creatorKey, bucket);
    }
    const seriesKey = holdingsSeriesKey(drop);
    if (seriesKey) {
      let series = bucket.seriesMap.get(seriesKey);
      if (!series) {
        series = {
          seriesKey,
          seriesId: drop.seriesId?.trim() || null,
          seriesTitle:
            drop.seriesTitle?.trim() || drop.seriesId?.trim() || seriesKey,
          drops: [],
        };
        bucket.seriesMap.set(seriesKey, series);
        bucket.group.series.push(series);
      }
      series.drops.push(drop);
    } else {
      bucket.ungrouped.push(drop);
    }
  }

  const result: CollectiblesLibraryCreatorGroup[] = [];
  for (const bucket of creators.values()) {
    if (bucket.ungrouped.length > 0) {
      bucket.group.series.push({
        seriesKey: null,
        seriesId: null,
        seriesTitle: null,
        drops: bucket.ungrouped,
      });
    }
    result.push(bucket.group);
  }
  return result;
}

export function countLibraryDrops(
  groups: CollectiblesLibraryCreatorGroup[]
): number {
  let n = 0;
  for (const creator of groups) {
    n += countLibraryCreatorDrops(creator);
  }
  return n;
}

export function countLibraryCreatorDrops(
  group: CollectiblesLibraryCreatorGroup
): number {
  let n = 0;
  for (const series of group.series) {
    n += series.drops.length;
  }
  return n;
}

/** Vault shelf sort — newest keeps first-seen order; name is A–Z. */
export type CollectiblesLibrarySort = 'newest' | 'name';

/** Show a jump rail once the shelf has this many creators. */
export const COLLECTIBLES_LIBRARY_JUMP_MIN = 6;

export function collectiblesLibraryHeadingId(
  prefix: string,
  key: string
): string {
  return `collectibles-${prefix}-${key.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

export function libraryCreatorSortLabel(
  group: Pick<CollectiblesLibraryCreatorGroup, 'creatorId'>,
  displayName?: string | null
): string {
  if (!group.creatorId) return 'other';
  const name = displayName?.trim();
  return (name || group.creatorId).toLowerCase();
}

/**
 * Newest = first-seen (current group order). Name = localeCompare on display
 * name / handle; series A–Z with ungrouped last.
 */
export function sortHoldingsLibrary(
  groups: CollectiblesLibraryCreatorGroup[],
  sort: CollectiblesLibrarySort,
  displayNames?: ReadonlyMap<string, string | null>
): CollectiblesLibraryCreatorGroup[] {
  if (sort !== 'name') return groups;
  return groups
    .map((creator) => ({
      ...creator,
      series: [...creator.series].sort((a, b) => {
        if (!a.seriesKey && b.seriesKey) return 1;
        if (a.seriesKey && !b.seriesKey) return -1;
        const left = (a.seriesTitle ?? a.seriesKey ?? '').toLowerCase();
        const right = (b.seriesTitle ?? b.seriesKey ?? '').toLowerCase();
        return left.localeCompare(right);
      }),
    }))
    .sort((a, b) => {
      const left = libraryCreatorSortLabel(
        a,
        a.creatorId ? displayNames?.get(a.creatorId) ?? null : null
      );
      const right = libraryCreatorSortLabel(
        b,
        b.creatorId ? displayNames?.get(b.creatorId) ?? null : null
      );
      return left.localeCompare(right);
    });
}

/** Keep headers; cut after `maxDrops` edition-collapsed rows. */
export function sliceLibraryGroups(
  groups: CollectiblesLibraryCreatorGroup[],
  maxDrops: number
): { groups: CollectiblesLibraryCreatorGroup[]; truncated: boolean } {
  const total = countLibraryDrops(groups);
  if (total <= maxDrops) return { groups, truncated: false };
  const out: CollectiblesLibraryCreatorGroup[] = [];
  let left = maxDrops;
  for (const creator of groups) {
    if (left <= 0) break;
    const seriesOut: CollectiblesLibrarySeriesGroup[] = [];
    for (const series of creator.series) {
      if (left <= 0) break;
      const drops = series.drops.slice(0, left);
      left -= drops.length;
      seriesOut.push({ ...series, drops });
    }
    if (seriesOut.length > 0) {
      out.push({ ...creator, series: seriesOut });
    }
  }
  return { groups: out, truncated: true };
}

export function vaultInventoryCreators(
  items: PortfolioHoldingPeek[]
): { id: string; label: string; count: number }[] {
  const map = new Map<string, { id: string; label: string; count: number }>();
  for (const drop of groupHoldingsForRail(items)) {
    const id = holdingsCreatorKey(drop.creatorId);
    const label = drop.creatorId?.trim() || 'Other';
    const cur = map.get(id);
    if (cur) cur.count += 1;
    else map.set(id, { id, label, count: 1 });
  }
  return [...map.values()];
}

export function vaultInventorySeries(
  items: PortfolioHoldingPeek[]
): { id: string; label: string; count: number }[] {
  const map = new Map<string, { id: string; label: string; count: number }>();
  for (const drop of groupHoldingsForRail(items)) {
    const id = holdingsSeriesKey(drop);
    if (!id) continue;
    const label = drop.seriesTitle?.trim() || drop.seriesId?.trim() || id;
    const cur = map.get(id);
    if (cur) cur.count += 1;
    else map.set(id, { id, label, count: 1 });
  }
  return [...map.values()];
}

export function holdingsMatchCreator(
  item: Pick<PortfolioHoldingPeek, 'creatorId'>,
  creator: string | null
): boolean {
  const needle = creator?.trim() || null;
  if (!needle) return true;
  if (needle === COLLECTIBLES_CREATOR_OTHER) {
    return !item.creatorId?.trim();
  }
  return accountIdsEqual(item.creatorId ?? '', needle);
}

export function holdingsMatchSeries(
  item: Pick<PortfolioHoldingPeek, 'seriesId' | 'seriesTitle'>,
  series: string | null
): boolean {
  const needle = series?.trim() || null;
  if (!needle) return true;
  return holdingsSeriesKey(item) === needle;
}

/**
 * Page kind rail — All + kinds actually held, plus the active URL kind so a
 * deep link stays on the rail even when that kind is empty. Full taxonomy
 * stays in Filter. Order matches `MARKET_MEDIUM_FILTERS`.
 */
export function vaultHeldKindFilters(
  items: ReadonlyArray<{ mediumKind?: string | null }>,
  selected: MarketMediumFilter = 'all'
): MarketMediumFilter[] {
  const held = new Set<MarketMediumFilter>();
  for (const item of items) {
    const kind = parseMarketMediumFilter(item.mediumKind);
    if (kind !== 'all') held.add(kind);
  }
  if (selected !== 'all') held.add(selected);
  return MARKET_MEDIUM_FILTERS.map((entry) => entry.id).filter(
    (id) => id === 'all' || held.has(id)
  );
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
  > &
    Partial<
      Pick<
        PortfolioHoldingPeek,
        'creatorId' | 'collectionId' | 'seriesId' | 'seriesTitle' | 'facets'
      >
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
    item.collectionId,
    item.seriesId,
    item.seriesTitle,
    ...(item.facets ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
