import { describe, expect, it, vi } from 'vitest';
import { DmMediaObjectUrlCache } from './dm-media-object-urls';

describe('DmMediaObjectUrlCache', () => {
  it('opens once and serves repeat resolves from the cache', async () => {
    const cache = new DmMediaObjectUrlCache(3, vi.fn());
    const open = vi.fn().mockResolvedValue('blob:a');
    await expect(cache.resolve('k', open)).resolves.toBe('blob:a');
    await expect(cache.resolve('k', open)).resolves.toBe('blob:a');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('dedupes an in-flight open across concurrent resolves', async () => {
    const cache = new DmMediaObjectUrlCache(3, vi.fn());
    let release!: (url: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const open = vi.fn().mockReturnValue(gate);
    const first = cache.resolve('k', open);
    const second = cache.resolve('k', open);
    release('blob:a');
    await expect(first).resolves.toBe('blob:a');
    await expect(second).resolves.toBe('blob:a');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used entry past the limit and revokes it', async () => {
    const revoke = vi.fn();
    const cache = new DmMediaObjectUrlCache(2, revoke);
    await cache.resolve('a', () => Promise.resolve('blob:a'));
    await cache.resolve('b', () => Promise.resolve('blob:b'));
    // Touching `a` makes `b` the oldest.
    await cache.resolve('a', () => Promise.resolve('blob:a-again'));
    await cache.resolve('c', () => Promise.resolve('blob:c'));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:b');
    const open = vi.fn();
    await cache.resolve('a', open);
    await cache.resolve('c', open);
    expect(open).not.toHaveBeenCalled();
  });

  it('does not cache failures, so a later resolve retries', async () => {
    const cache = new DmMediaObjectUrlCache(2, vi.fn());
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('blob:ok');
    await expect(cache.resolve('k', open)).rejects.toThrow('network');
    await expect(cache.resolve('k', open)).resolves.toBe('blob:ok');
    expect(open).toHaveBeenCalledTimes(2);
  });
});
