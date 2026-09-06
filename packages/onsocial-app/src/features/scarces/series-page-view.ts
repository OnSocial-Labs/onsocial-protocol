import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import { accountIdsEqual } from '@/lib/account-match';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

export type SeriesHoldMatch = {
  creatorId: string;
  seriesId: string;
  collectionIds: readonly string[];
};

/** Slug → title: `night-roads` → `Night Roads`. Leaves a real name alone. */
export function humanizeSeriesId(seriesId: string): string {
  const raw = seriesId.trim();
  if (!raw) return raw;
  if (/[\s]/.test(raw) && raw !== raw.toLowerCase()) return raw;
  return raw
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Brand title, then stamped series title, then a humanized id. */
export function seriesDisplayTitle(opts: {
  brandingTitle?: string | null;
  dropSeriesTitle?: string | null;
  seriesId: string;
}): string {
  const branded = opts.brandingTitle?.trim();
  if (branded) return branded;
  const stamped = opts.dropSeriesTitle?.trim();
  if (stamped) return stamped;
  return humanizeSeriesId(opts.seriesId);
}

/** First paint after an SSR catalog miss — skeleton until the client settles. */
export function seriesCatalogShell(opts: {
  hasCatalog: boolean;
  hasHeld: boolean;
  ssrMiss: boolean;
  clientSettled: boolean;
}): 'ready' | 'skeleton' | 'empty' {
  if (opts.hasCatalog || opts.hasHeld) return 'ready';
  if (opts.ssrMiss && !opts.clientSettled) return 'skeleton';
  return 'empty';
}

export function seriesShopActionLabel(status: string): string {
  return status === 'live' ? 'Collect' : 'Open';
}

/** Compact @handle on multi-creator shop rows — same voice as Collectibles. */
export function shopRowCreatorHandle(creatorId: string): string {
  const id = creatorId.trim();
  return id ? `@${fallbackLabel(id)}` : '';
}

/** Creator or someone who holds an edition in this line. */
export function seriesUseFirst(opts: {
  isOwner: boolean;
  holdsEditionInSeries: boolean | null;
}): boolean {
  return opts.isOwner || opts.holdsEditionInSeries === true;
}

/** Holders go back to the vault; visitors stay on this creator's Market. */
export function seriesPageBackHref(opts: {
  useFirst: boolean;
  viewerAccountId?: string | null;
  shopHref: string;
}): string {
  const account = opts.viewerAccountId?.trim();
  if (opts.useFirst && account) return portfolioCollectiblesPath(account);
  return opts.shopHref;
}

function itemCollectionId(item: {
  collectionId?: string | null;
  tokenId: string;
}): string {
  return (
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId) || ''
  );
}

/** Owned tokens that belong to this series (catalog ids or stamped series). */
export function ownedItemsInSeries(
  items: readonly OwnedScarceItem[],
  match: SeriesHoldMatch
): OwnedScarceItem[] {
  const series = match.seriesId.trim();
  const creator = match.creatorId.trim();
  const ids = new Set(
    match.collectionIds.map((id) => id.trim()).filter(Boolean)
  );
  if (!series && ids.size === 0) return [];
  return items.filter((item) => {
    const collectionId = itemCollectionId(item);
    if (collectionId && ids.has(collectionId)) return true;
    const itemSeries = item.seriesId?.trim();
    if (!series || itemSeries !== series) return false;
    const itemCreator = item.creatorId?.trim();
    if (itemCreator && creator && !accountIdsEqual(itemCreator, creator)) {
      return false;
    }
    return true;
  });
}

/** Sync peek — Collectibles → series must not flash visitor shop chrome. */
export function peekHeldSeriesItems(
  accountId: string | null | undefined,
  match: SeriesHoldMatch
): OwnedScarceItem[] {
  const owner = accountId?.trim();
  if (!owner) return [];
  const page = peekOwnedVaultPage(owner);
  if (!page) return [];
  return ownedItemsInSeries(page.items, match);
}

export function peekHoldsSeries(
  accountId: string | null | undefined,
  match: SeriesHoldMatch
): boolean {
  return peekHeldSeriesItems(accountId, match).length > 0;
}

export function heldCollectionIdSet(
  items: readonly OwnedScarceItem[]
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const id = itemCollectionId(item);
    if (id) ids.add(id);
  }
  return ids;
}
