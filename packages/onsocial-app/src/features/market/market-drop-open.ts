import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import type { CollectionView } from '@/features/scarces/collections-data';

/**
 * Market listing → overlay seed. Same contract as Drops / Just sold peeks:
 * cover + title (+ creator/kind when known); catalog soft-fills the rest.
 */
export function seedCollectionViewFromMarketListing(item: {
  collectionId?: string | null;
  tokenId?: string | null;
  title: string;
  mediaUrl?: string | null;
  creatorId?: string | null;
  artistId?: string | null;
  mediumKind?: string | null;
  audioFormat?: CollectionView['audioFormat'];
}): CollectionView | null {
  const collectionId =
    item.collectionId?.trim() ||
    collectionIdFromTokenId(item.tokenId ?? '') ||
    '';
  if (!collectionId) return null;
  const creatorId = item.artistId?.trim() || item.creatorId?.trim() || null;
  return seedCollectionViewFromPeek({
    collectionId,
    title: item.title,
    coverUrl: item.mediaUrl,
    creatorId,
    kind: item.mediumKind ?? null,
    audioFormat: item.audioFormat ?? null,
  });
}

/** Market Recent sale → overlay seed when the row opens a drop (not a post). */
export function seedCollectionViewFromMarketSale(sale: {
  tokenId?: string | null;
  title: string;
  mediaUrl?: string | null;
  creatorId?: string | null;
}): CollectionView | null {
  const collectionId = collectionIdFromTokenId(sale.tokenId ?? '');
  if (!collectionId) return null;
  return seedCollectionViewFromPeek({
    collectionId,
    title: sale.title,
    coverUrl: sale.mediaUrl,
    creatorId: sale.creatorId,
  });
}
