import { collectionIdFromTokenId } from '@/features/market/market-listings';
import {
  seedCollectionViewFromPeek,
  seedCollectionViewFromStoreDrop,
} from '@/features/scarces/collection-page-view';
import type { CollectionView } from '@/features/scarces/collections-data';

/**
 * Market listing → place seed. Jacket + known deal line on frame 1;
 * catalog soft-fills the rest. Drop open resolve prefers peeked full view.
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
  priceNear?: string | null;
  usdE6?: string | null;
  remaining?: number | null;
  copies?: number | null;
}): CollectionView | null {
  const collectionId =
    item.collectionId?.trim() ||
    collectionIdFromTokenId(item.tokenId ?? '') ||
    '';
  if (!collectionId) return null;
  const creatorId = item.artistId?.trim() || item.creatorId?.trim() || null;
  const totalSupply = item.copies != null && item.copies > 0 ? item.copies : 0;
  const remaining =
    item.remaining != null && item.remaining >= 0
      ? item.remaining
      : totalSupply;
  if (totalSupply > 0 || item.priceNear?.trim() || item.usdE6?.trim()) {
    return seedCollectionViewFromStoreDrop(
      {
        collectionId,
        title: item.title,
        mediaUrl: item.mediaUrl,
        priceNear: item.priceNear,
        usdE6: item.usdE6,
        remaining,
        totalSupply,
        status: totalSupply > 0 && remaining === 0 ? 'sold_out' : 'live',
        mediumKind: item.mediumKind,
        audioFormat: item.audioFormat,
      },
      creatorId
    );
  }
  return seedCollectionViewFromPeek({
    collectionId,
    title: item.title,
    coverUrl: item.mediaUrl,
    creatorId,
    kind: item.mediumKind ?? null,
    audioFormat: item.audioFormat ?? null,
  });
}

/** Market Recent sale → place seed when the row opens a drop (not a post). */
export function seedCollectionViewFromMarketSale(sale: {
  tokenId?: string | null;
  title: string;
  mediaUrl?: string | null;
  creatorId?: string | null;
  priceNear?: string | null;
  usdE6?: string | null;
}): CollectionView | null {
  const collectionId = collectionIdFromTokenId(sale.tokenId ?? '');
  if (!collectionId) return null;
  if (sale.priceNear?.trim() || sale.usdE6?.trim()) {
    return seedCollectionViewFromStoreDrop(
      {
        collectionId,
        title: sale.title,
        mediaUrl: sale.mediaUrl,
        priceNear: sale.priceNear,
        usdE6: sale.usdE6,
        remaining: 0,
        totalSupply: 0,
        status: 'sold_out',
      },
      sale.creatorId
    );
  }
  return seedCollectionViewFromPeek({
    collectionId,
    title: sale.title,
    coverUrl: sale.mediaUrl,
    creatorId: sale.creatorId,
  });
}

/** Owned pass row → place seed from the holding already on the row. */
export function seedCollectionViewFromOwnedPass(item: {
  collectionId?: string | null;
  title: string;
  mediaUrl?: string | null;
  creatorId?: string | null;
  mediumKind?: string | null;
  audioFormat?: CollectionView['audioFormat'];
}): CollectionView | null {
  const collectionId = item.collectionId?.trim() || '';
  if (!collectionId) return null;
  return seedCollectionViewFromPeek({
    collectionId,
    title: item.title,
    coverUrl: item.mediaUrl,
    creatorId: item.creatorId,
    kind: item.mediumKind ?? null,
    audioFormat: item.audioFormat ?? null,
  });
}
