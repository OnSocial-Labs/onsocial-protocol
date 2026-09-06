import { collectionIdFromTokenId } from '@/features/market/market-listings';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Public Market in creator-shop mode (`?creator=`). */
export function marketCreatorShop(
  creator: string | null | undefined
): boolean {
  return Boolean(creator?.trim());
}

/**
 * First paint after an SSR catalog miss — skeleton until drops and
 * listings have both settled. Held/ready as soon as either list has rows.
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

export function marketCreatorShopActionLabel(
  status: ProfileStoreDrop['status']
): string {
  return status === 'live' ? 'Collect' : 'Open';
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
