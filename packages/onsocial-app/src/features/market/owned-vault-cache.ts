import type { OwnedScarcesPage } from '@/features/market/market-listings';

const TTL_MS = 30_000;

type CacheEntry = {
  at: number;
  page: OwnedScarcesPage;
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

/** Store first-page owned vault (caller only writes when `fromEnd === 0`). */
export function putOwnedVaultPage(
  accountId: string,
  page: OwnedScarcesPage
): void {
  const key = ownerKey(accountId);
  if (!key) return;
  pageZeroByOwner.set(key, { at: Date.now(), page });
}

export function invalidateOwnedVaultCache(accountId?: string): void {
  if (!accountId?.trim()) {
    pageZeroByOwner.clear();
    return;
  }
  pageZeroByOwner.delete(ownerKey(accountId));
}
