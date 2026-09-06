import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import { fallbackLabel } from '@/lib/profile-display';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

export type MarketCreatorDropBucket = 'live' | 'upcoming' | 'past';

export type MarketCreatorDropGroup = {
  bucket: MarketCreatorDropBucket;
  label: string;
  drops: ProfileStoreDrop[];
};

const BUCKET_ORDER: MarketCreatorDropBucket[] = ['live', 'upcoming', 'past'];
const BUCKET_LABEL: Record<MarketCreatorDropBucket, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  past: 'Past',
};

/** Public Market in creator-shop mode (`?creator=`). */
export function marketCreatorShop(
  creator: string | null | undefined
): boolean {
  return Boolean(creator?.trim());
}

/** Leave the shop to global Market — same destination as dock back. */
export function marketCreatorBackHref(): string {
  return APP_MARKET_PATH;
}

export function marketCreatorScreenTitle(opts: {
  displayName?: string | null;
  creatorId: string;
}): string {
  const named = opts.displayName?.trim();
  if (named) return named;
  const handle = fallbackLabel(opts.creatorId);
  return handle ? `@${handle}` : 'Shop';
}

export function marketCreatorDocumentTitle(opts: {
  displayName?: string | null;
  creatorId: string;
}): string {
  return `${marketCreatorScreenTitle(opts)} • Market`;
}

export function marketCreatorEmptyCopy(): string {
  return 'Nothing in this shop yet.';
}

export function marketCreatorBrowseLabel(): string {
  return 'Browse Market';
}

export function marketCreatorShopCountCopy(opts: {
  dropCount: number;
  listingCount: number;
}): string | null {
  if (opts.dropCount <= 0 && opts.listingCount <= 0) return null;
  const drops = `${opts.dropCount} ${opts.dropCount === 1 ? 'drop' : 'drops'}`;
  if (opts.listingCount <= 0) return drops;
  return `${drops} · ${opts.listingCount} for sale`;
}

export function marketCreatorSearchPlaceholder(): string {
  return 'Search shop';
}

/**
 * First paint after an SSR catalog miss — skeleton until drops and
 * listings have both settled. Ready as soon as either list has rows.
 */
export function marketCreatorCatalogShell(opts: {
  hasDrops: boolean;
  hasListings: boolean;
  ssrMiss: boolean;
  clientSettled: boolean;
}): 'ready' | 'skeleton' | 'empty' {
  if (opts.hasDrops || opts.hasListings) return 'ready';
  if (opts.ssrMiss && !opts.clientSettled) return 'skeleton';
  return 'empty';
}

export function marketCreatorDropMintable(drop: ProfileStoreDrop): boolean {
  return drop.status === 'live' && drop.remaining > 0;
}

export function marketCreatorShopActionLabel(drop: ProfileStoreDrop): string {
  return marketCreatorDropMintable(drop) ? 'Mint' : 'Open';
}

export function marketCreatorDropBucket(
  status: ProfileStoreDrop['status']
): MarketCreatorDropBucket {
  if (status === 'live') return 'live';
  if (status === 'upcoming') return 'upcoming';
  return 'past';
}

export function groupMarketCreatorDrops(
  drops: readonly ProfileStoreDrop[]
): MarketCreatorDropGroup[] {
  const buckets: Record<MarketCreatorDropBucket, ProfileStoreDrop[]> = {
    live: [],
    upcoming: [],
    past: [],
  };
  for (const drop of drops) {
    buckets[marketCreatorDropBucket(drop.status)].push(drop);
  }
  for (const bucket of BUCKET_ORDER) {
    buckets[bucket].sort(
      (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
    );
  }
  return BUCKET_ORDER.filter((bucket) => buckets[bucket].length > 0).map(
    (bucket) => ({
      bucket,
      label: BUCKET_LABEL[bucket],
      drops: buckets[bucket],
    })
  );
}

export function marketCreatorDropMatchesQuery(
  drop: ProfileStoreDrop,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [drop.title, drop.mediumKind, drop.collectionId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function marketCreatorDropMatchesMedium(
  drop: ProfileStoreDrop,
  medium: string
): boolean {
  if (!medium || medium === 'all') return true;
  return (drop.mediumKind ?? '').toLowerCase() === medium.toLowerCase();
}

export function listedCollectionIdSet(
  items: readonly {
    collectionId?: string | null;
    tokenId?: string | null;
  }[]
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const explicit = item.collectionId?.trim();
    if (explicit) {
      ids.add(explicit);
      continue;
    }
    const fromToken = item.tokenId
      ? collectionIdFromTokenId(item.tokenId)
      : null;
    if (fromToken) ids.add(fromToken);
  }
  return ids;
}
