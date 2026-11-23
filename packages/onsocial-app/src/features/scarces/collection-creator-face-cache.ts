import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';

/** Soft-nav drop opens remember list/feed creator chrome for frame 1. */
const cache = new Map<string, CollectionCreatorFace>();
const MAX = 48;

export function rememberCollectionCreatorFace(
  collectionId: string,
  face: CollectionCreatorFace | null | undefined
): void {
  const id = collectionId.trim();
  if (!id || !face) return;
  if (!face.displayName?.trim() && !face.avatarUrl?.trim()) return;
  if (cache.has(id)) cache.delete(id);
  cache.set(id, face);
  while (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

/** Read without bumping LRU. */
export function readCollectionCreatorFace(
  collectionId: string
): CollectionCreatorFace | null {
  const id = collectionId.trim();
  if (!id) return null;
  return cache.get(id) ?? null;
}

/** Test helper — empty the cache between cases. */
export function clearCollectionCreatorFaceCache(): void {
  cache.clear();
}
