/**
 * Lets a confirmed buy, sale, or cancel drop that row from catalog memory
 * without the buy form importing Market, Drops, or Collectibles.
 * Each catalog registers while its module is loaded.
 */

export type CatalogListingRef = {
  tokenId?: string;
  listingId?: string;
};

export function marketListingMatches(
  item: { kind?: string; tokenId?: string; listingId?: string },
  target: CatalogListingRef
): boolean {
  const listingId = target.listingId?.trim();
  const tokenId = target.tokenId?.trim();
  if (listingId && item.listingId === listingId) return true;
  if (tokenId && item.tokenId === tokenId && item.kind !== 'lazy') return true;
  return false;
}

type MarketForget = (target: CatalogListingRef) => void;
type MarketReprice = (
  target: CatalogListingRef & { priceNear: string }
) => void;
type DropForget = (collectionId: string) => void;
type DropReprice = (collectionId: string, priceNear: string) => void;
type CollectiblesForget = (accountId: string) => void;

const marketForgets = new Set<MarketForget>();
const marketReprices = new Set<MarketReprice>();
const dropForgets = new Set<DropForget>();
const dropReprices = new Set<DropReprice>();
const collectiblesForgets = new Set<CollectiblesForget>();

function subscribe<T>(bucket: Set<T>, fn: T): () => void {
  bucket.add(fn);
  return () => {
    bucket.delete(fn);
  };
}

export function registerMarketForget(fn: MarketForget): () => void {
  return subscribe(marketForgets, fn);
}

export function registerMarketReprice(fn: MarketReprice): () => void {
  return subscribe(marketReprices, fn);
}

export function registerDropForget(fn: DropForget): () => void {
  return subscribe(dropForgets, fn);
}

export function registerDropReprice(fn: DropReprice): () => void {
  return subscribe(dropReprices, fn);
}

export function registerCollectiblesForget(fn: CollectiblesForget): () => void {
  return subscribe(collectiblesForgets, fn);
}

export function forgetMarketListing(target: CatalogListingRef): void {
  if (!target.tokenId?.trim() && !target.listingId?.trim()) return;
  for (const fn of marketForgets) fn(target);
}

export function repriceMarketListing(
  target: CatalogListingRef & { priceNear: string }
): void {
  const priceNear = target.priceNear.trim();
  if (!priceNear) return;
  if (!target.tokenId?.trim() && !target.listingId?.trim()) return;
  for (const fn of marketReprices) fn({ ...target, priceNear });
}

export function forgetDrop(collectionId: string): void {
  const id = collectionId.trim();
  if (!id) return;
  for (const fn of dropForgets) fn(id);
}

export function repriceDrop(collectionId: string, priceNear: string): void {
  const id = collectionId.trim();
  const next = priceNear.trim();
  if (!id || !next) return;
  for (const fn of dropReprices) fn(id, next);
}

export function forgetCollectiblesPlace(accountId: string): void {
  const id = accountId.trim();
  if (!id) return;
  for (const fn of collectiblesForgets) fn(id);
}
