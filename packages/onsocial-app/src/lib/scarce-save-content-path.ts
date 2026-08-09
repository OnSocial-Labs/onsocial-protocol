/**
 * Private save paths for scarce drops / collections.
 * Must stay within contract path charset (A-Za-z0-9_.-/).
 * Collection IDs are slug suffixes without `:`.
 */

const COLLECTION_PREFIX = 'scarce/collection/';

/** Content path for a drop / collection bookmark. */
export function scarceCollectionContentPath(collectionId: string): string {
  const id = collectionId.trim();
  if (!id) {
    throw new Error('scarceCollectionContentPath requires a collectionId');
  }
  return `${COLLECTION_PREFIX}${id}`;
}

/** Parse a save path back to a collection id, or null if not a scarce collection save. */
export function parseScarceCollectionSavePath(
  path: string | null | undefined
): string | null {
  const trimmed = path?.trim() ?? '';
  if (!trimmed.startsWith(COLLECTION_PREFIX)) return null;
  const id = trimmed.slice(COLLECTION_PREFIX.length).trim();
  return id || null;
}

export function isScarceCollectionSavePath(
  path: string | null | undefined
): boolean {
  return parseScarceCollectionSavePath(path) != null;
}
