import { describe, expect, it } from 'vitest';
import * as daoShellCacheApi from './dao-shell-cache';
import { readDaoBrandingCache, seedDaoBrandingCache } from './dao-shell-cache';

/** Matches DAO_SHELL_CACHE_MAX — a directory pass of community faces. */
const DAO_SHELL_CACHE_MAX = 40;

function resetDaoShellCache(): void {
  const clear = (
    daoShellCacheApi as { clearDaoBrandingCacheForTests?: () => void }
  ).clearDaoBrandingCacheForTests;
  clear?.();
}

describe('dao shell cache bound', () => {
  it('evicts the oldest branding entry past the cap', () => {
    resetDaoShellCache();
    const published = (daoShellCacheApi as { DAO_SHELL_CACHE_MAX?: number })
      .DAO_SHELL_CACHE_MAX;
    if (published !== undefined) expect(published).toBe(DAO_SHELL_CACHE_MAX);

    for (let i = 0; i < DAO_SHELL_CACHE_MAX + 1; i += 1) {
      seedDaoBrandingCache(`dao${i}.near`, null);
    }
    expect(readDaoBrandingCache('dao0.near')).toBeUndefined();
    expect(readDaoBrandingCache(`dao${DAO_SHELL_CACHE_MAX}.near`)).toBeNull();
  });

  it('refreshes LRU on read so a hot dao survives', () => {
    resetDaoShellCache();
    seedDaoBrandingCache('hot.near', null);
    for (let i = 0; i < DAO_SHELL_CACHE_MAX; i += 1) {
      expect(readDaoBrandingCache('hot.near')).toBeNull();
      seedDaoBrandingCache(`cold${i}.near`, null);
    }
    expect(readDaoBrandingCache('hot.near')).toBeNull();
    expect(readDaoBrandingCache('cold0.near')).toBeUndefined();
  });
});
