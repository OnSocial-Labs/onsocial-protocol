/**
 * In-memory DAO branding cache — same family as guild / series shell caches.
 */

import type { DaoBranding } from '@/features/protocol/dao-branding';

const cache = new Map<string, DaoBranding | null>();

export function seedDaoBrandingCache(
  daoAccountId: string,
  branding: DaoBranding | null
): void {
  const id = daoAccountId.trim().toLowerCase();
  if (!id) return;
  cache.set(id, branding);
}

export function readDaoBrandingCache(
  daoAccountId: string
): DaoBranding | null | undefined {
  const id = daoAccountId.trim().toLowerCase();
  if (!id) return undefined;
  return cache.has(id) ? (cache.get(id) ?? null) : undefined;
}

export function invalidateDaoBrandingCache(daoAccountId: string): void {
  cache.delete(daoAccountId.trim().toLowerCase());
}
