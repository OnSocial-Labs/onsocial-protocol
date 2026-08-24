import {
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Collection catalog row → drawer drop card (kind metadata for row eyebrows). */
export function collectionToProfileStoreDrop(
  collection: CollectionView
): ProfileStoreDrop {
  return {
    key: collection.collectionId,
    collectionId: collection.collectionId,
    title: collection.title,
    mediaUrl: collection.mediaUrl,
    priceNear: collection.priceNear,
    remaining: collection.remaining,
    totalSupply: collection.totalSupply,
    status: deriveCollectionStatus(collection),
    ...(collection.kind ? { mediumKind: collection.kind } : {}),
    ...(collection.audioFormat ? { audioFormat: collection.audioFormat } : {}),
    ...(collection.writingFormat
      ? { writingFormat: collection.writingFormat }
      : {}),
    ...(collection.playables.length > 0 ? { hasPlayable: true } : {}),
    ...(collection.createdAtMs > 0
      ? { createdAtMs: collection.createdAtMs }
      : {}),
  };
}
