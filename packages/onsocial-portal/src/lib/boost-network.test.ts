import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchActiveBoosterCount } from '@/lib/boost-network';

describe('fetchActiveBoosterCount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when the pulse request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );
    await expect(fetchActiveBoosterCount()).resolves.toBeNull();
  });

  it('returns the indexed count when the pulse request succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ boosterCount: 7 }),
      })
    );
    await expect(fetchActiveBoosterCount()).resolves.toBe(7);
  });

  it('keeps a real zero distinct from an unknown count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ boosterCount: 0 }),
      })
    );
    await expect(fetchActiveBoosterCount()).resolves.toBe(0);
  });
});
