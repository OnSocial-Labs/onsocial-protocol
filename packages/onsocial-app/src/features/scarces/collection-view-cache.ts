import type { CollectionView } from '@/features/scarces/collections-data';

/** LRU of full catalog views — feed cards and list opens share one seed. */
const cache = new Map<string, CollectionView>();
const MAX = 48;

/** Remember a full drop view (Drops `item.view` equivalent). */
export function rememberCollectionView(
  view: CollectionView | null | undefined
): void {
  const id = view?.collectionId?.trim();
  if (!id || !view) return;
  if (cache.has(id)) cache.delete(id);
  cache.set(id, view);
  while (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

/** True when a full view is cached — does not bump LRU. */
export function hasCollectionView(collectionId: string): boolean {
  const id = collectionId.trim();
  return Boolean(id && cache.has(id));
}

/** Read a remembered view without bumping LRU (resolve / loading / panel init). */
export function readCollectionView(
  collectionId: string
): CollectionView | null {
  const id = collectionId.trim();
  if (!id) return null;
  return cache.get(id) ?? null;
}

/** Test helper — empty the cache between cases. */
export function clearCollectionViewCache(): void {
  cache.clear();
}
