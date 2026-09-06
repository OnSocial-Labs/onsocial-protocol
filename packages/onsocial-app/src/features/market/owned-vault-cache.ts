import type { OwnedScarcesPage } from '@/features/market/market-listings';
import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';

const TTL_MS = 30_000;

type CacheEntry = {
  at: number;
  page: OwnedScarcesPage;
  faces: Record<string, CollectionCreatorFace>;
};

const pageZeroByOwner = new Map<string, CacheEntry>();

function ownerKey(accountId: string): string {
  return accountId.trim().toLowerCase();
}

/** Sync peek of the first owned page — paints Collectibles / Yours without refetch. */
export function peekOwnedVaultPage(
  accountId: string
): OwnedScarcesPage | null {
  const key = ownerKey(accountId);
  if (!key) return null;
  const hit = pageZeroByOwner.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    pageZeroByOwner.delete(key);
    return null;
  }
  return hit.page;
}

/** Faces stored with the last first-page write — revisit must not letter-morph. */
export function peekOwnedVaultFaces(
  accountId: string
): Map<string, CollectionCreatorFace> {
  const key = ownerKey(accountId);
  if (!key) return new Map();
  const hit = pageZeroByOwner.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) return new Map();
  return new Map(Object.entries(hit.faces));
}

/** Store first-page owned vault (caller only writes when `fromEnd === 0`). */
export function putOwnedVaultPage(
  accountId: string,
  page: OwnedScarcesPage,
  faces?: Record<string, CollectionCreatorFace>
): void {
  const key = ownerKey(accountId);
  if (!key) return;
  const prev = pageZeroByOwner.get(key);
  const nextFaces =
    faces && Object.keys(faces).length > 0 ? faces : (prev?.faces ?? {});
  pageZeroByOwner.set(key, { at: Date.now(), page, faces: nextFaces });
}

export function invalidateOwnedVaultCache(accountId?: string): void {
  if (!accountId?.trim()) {
    pageZeroByOwner.clear();
    return;
  }
  pageZeroByOwner.delete(ownerKey(accountId));
}
