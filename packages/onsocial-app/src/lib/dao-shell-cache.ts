/**
 * In-memory DAO branding cache — same family as guild / series shell caches.
 */

import type { DaoBranding } from '@/features/protocol/dao-branding';
import { readBoundedMap, writeBoundedMap } from '@/lib/bounded-map';

/**
 * One branding record per DAO visited. Same family as the guild shell (50).
 * A heavy directory pass is the two protocol DAOs plus a few dozen community
 * faces.
 */
export const DAO_SHELL_CACHE_MAX = 40;

const cache = new Map<string, DaoBranding | null>();

export function seedDaoBrandingCache(
  daoAccountId: string,
  branding: DaoBranding | null
): void {
  const id = daoAccountId.trim().toLowerCase();
  if (!id) return;
  writeBoundedMap(cache, id, branding, DAO_SHELL_CACHE_MAX);
}

export function readDaoBrandingCache(
  daoAccountId: string
): DaoBranding | null | undefined {
  const id = daoAccountId.trim().toLowerCase();
  if (!id || !cache.has(id)) return undefined;
  const value = readBoundedMap(cache, id);
  return value === undefined ? null : value;
}

export function invalidateDaoBrandingCache(daoAccountId: string): void {
  cache.delete(daoAccountId.trim().toLowerCase());
}

export function clearDaoBrandingCacheForTests(): void {
  cache.clear();
}
