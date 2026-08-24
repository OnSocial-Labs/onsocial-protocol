import { collectionIdFromTokenId } from '@/features/market/market-listings';
import type {
  ProfileStoreDrop,
  ProfileStoreListing,
  ProfileStoreShelf,
} from '@/lib/profile-store-types';

/** Store tab — mintable now or starting soon. Catalog history lives in Drops. */
export type BuyableStoreDropStatus = ProfileStoreDrop['status'];

const BUYABLE_STORE_DROP_STATUSES = new Set<BuyableStoreDropStatus>([
  'live',
  'upcoming',
]);

export function isBuyableStoreDrop(
  drop: Pick<ProfileStoreDrop, 'status'>
): boolean {
  return BUYABLE_STORE_DROP_STATUSES.has(drop.status);
}

export function filterBuyableStoreDrops(
  drops: ProfileStoreDrop[]
): ProfileStoreDrop[] {
  return drops.filter(isBuyableStoreDrop);
}

export function resolveStoreListingCollectionId(
  listing: Pick<ProfileStoreListing, 'collectionId' | 'tokenId'>
): string | null {
  const explicit = listing.collectionId?.trim();
  if (explicit) return explicit;
  if (!listing.tokenId?.trim()) return null;
  return collectionIdFromTokenId(listing.tokenId);
}

/**
 * Live collections already render as drop cards — skip duplicate lazy
 * listing rows for the same collection id.
 */
export function dedupeStoreListingsForDrops(
  listings: ProfileStoreListing[],
  drops: ProfileStoreDrop[]
): ProfileStoreListing[] {
  if (drops.length === 0) return listings;
  const dropIds = new Set(drops.map((drop) => drop.collectionId));
  return listings.filter((listing) => {
    if (listing.kind !== 'lazy') return true;
    const collectionId = resolveStoreListingCollectionId(listing);
    if (!collectionId) return true;
    return !dropIds.has(collectionId);
  });
}

/**
 * Inverse dedupe for the Market-row drawer: the lazy listing row carries the
 * Mint action, so drops already covered by a listed collection id drop out
 * of the Drops section.
 */
export function filterDropsNotListed(
  drops: ProfileStoreDrop[],
  listedCollectionIds: ReadonlySet<string>
): ProfileStoreDrop[] {
  if (listedCollectionIds.size === 0) return drops;
  return drops.filter((drop) => !listedCollectionIds.has(drop.collectionId));
}

/** Drawer Store tab — available inventory only (no sold-out catalog rows). */
export function buildAvailableStoreShelf(
  shelf: ProfileStoreShelf
): ProfileStoreShelf {
  const drops = filterBuyableStoreDrops(shelf.drops);
  const listings = dedupeStoreListingsForDrops(shelf.listings, drops);
  return {
    ...shelf,
    drops,
    listings,
    sales: [],
  };
}

export function isStoreTabVisible(shelf: ProfileStoreShelf): boolean {
  const available = buildAvailableStoreShelf(shelf);
  return (
    available.drops.length > 0 || available.listings.length > 0 || shelf.hasMore
  );
}

/** Scarces drawer tab — shop now and/or published works catalog. */
export function isScarcesTabVisible(
  shelf: ProfileStoreShelf,
  createdCount: number
): boolean {
  return isStoreTabVisible(shelf) || createdCount > 0;
}
