import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { collectionPath, marketCreatorPath } from '@/lib/app-routes';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import type { ProfileStoreListing } from '@/lib/profile-store-types';

/** Live-listing badge — social voice, not marketplace kind jargon. */
export const STORE_LISTING_BADGE: Record<ProfileStoreListing['kind'], string> =
  {
    lazy: 'Edition',
    native: 'For sale',
    auction: 'Auction',
  };

/**
 * Card badge — marks primary vs secondary in one list instead of splitting
 * tabs: their own work reads Edition / For sale, another creator's work
 * they're selling reads Resale.
 */
export function storeListingBadge(
  listing: Pick<ProfileStoreListing, 'kind' | 'resale'>
): string {
  if (listing.resale && listing.kind !== 'auction') return 'Resale';
  return STORE_LISTING_BADGE[listing.kind];
}

/**
 * Deep-link a Store peek to the item (source post or drop), not the whole
 * creator shop. Shop is the "See all" fallback only.
 */
export function storeListingHref(
  listing: Pick<ProfileStoreListing, 'sourcePostPath' | 'tokenId'>,
  pageAccountId: string
): string {
  const postHref = postHrefFromSourcePath(listing.sourcePostPath);
  if (postHref) return postHref;
  const collectionId = listing.tokenId
    ? collectionIdFromTokenId(listing.tokenId)
    : null;
  if (collectionId) return collectionPath(collectionId);
  return marketCreatorPath(pageAccountId);
}
