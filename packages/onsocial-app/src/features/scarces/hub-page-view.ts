import {
  collectionIdFromTokenId,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import { APP_APPS_PATH } from '@/lib/app-routes';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';

export type HubHoldMatch = {
  appId: string;
  collectionIds: readonly string[];
};

/** First paint after an SSR catalog miss — skeleton until the client settles. */
export function hubCatalogShell(opts: {
  hasCatalog: boolean;
  hasHeld: boolean;
  ssrMiss: boolean;
  clientSettled: boolean;
}): 'ready' | 'skeleton' | 'empty' {
  if (opts.hasCatalog || opts.hasHeld) return 'ready';
  if (opts.ssrMiss && !opts.clientSettled) return 'skeleton';
  return 'empty';
}

/** Staff or someone who holds an edition from this hub. */
export function hubUseFirst(opts: {
  isAuthority: boolean;
  holdsEditionInHub: boolean | null;
}): boolean {
  return opts.isAuthority || opts.holdsEditionInHub === true;
}

/** Holders go back to the vault; visitors stay on Hubs. */
export function hubPageBackHref(opts: {
  useFirst: boolean;
  viewerAccountId?: string | null;
}): string {
  const account = opts.viewerAccountId?.trim();
  if (opts.useFirst && account) return portfolioCollectiblesPath(account);
  return APP_APPS_PATH;
}

function itemCollectionId(item: {
  collectionId?: string | null;
  tokenId: string;
}): string {
  return (
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId) || ''
  );
}

/** Owned tokens that belong to this hub's catalog. */
export function ownedItemsInHub(
  items: readonly OwnedScarceItem[],
  match: HubHoldMatch
): OwnedScarceItem[] {
  const ids = new Set(
    match.collectionIds.map((id) => id.trim()).filter(Boolean)
  );
  if (ids.size === 0) return [];
  return items.filter((item) => {
    const collectionId = itemCollectionId(item);
    return Boolean(collectionId && ids.has(collectionId));
  });
}

/** Sync peek — Collectibles → hub must not flash visitor shop chrome. */
export function peekHeldHubItems(
  accountId: string | null | undefined,
  match: HubHoldMatch
): OwnedScarceItem[] {
  const owner = accountId?.trim();
  if (!owner) return [];
  const page = peekOwnedVaultPage(owner);
  if (!page) return [];
  return ownedItemsInHub(page.items, match);
}

export function peekHoldsHub(
  accountId: string | null | undefined,
  match: HubHoldMatch
): boolean {
  return peekHeldHubItems(accountId, match).length > 0;
}
