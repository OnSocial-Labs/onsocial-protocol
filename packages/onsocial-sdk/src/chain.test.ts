import { describe, expect, it, vi } from 'vitest';
import { ChainModule } from './chain.js';

describe('ChainModule.listKeys', () => {
  it('passes prefix only by default', async () => {
    const get = vi.fn().mockResolvedValue([]);
    const chain = new ChainModule({ get } as never);
    await chain.listKeys('alice.near/profile/');
    expect(get).toHaveBeenCalledWith(
      '/data/keys?prefix=alice.near%2Fprofile%2F'
    );
  });

  it('forwards fromKey, limit, withValues when provided', async () => {
    const get = vi.fn().mockResolvedValue([]);
    const chain = new ChainModule({ get } as never);
    await chain.listKeys('alice.near/posts/', {
      fromKey: 'alice.near/posts/abc',
      limit: 25,
      withValues: true,
    });
    expect(get).toHaveBeenCalledWith(
      '/data/keys?prefix=alice.near%2Fposts%2F&fromKey=alice.near%2Fposts%2Fabc&limit=25&withValues=true'
    );
  });

  it('omits withValues when false', async () => {
    const get = vi.fn().mockResolvedValue([]);
    const chain = new ChainModule({ get } as never);
    await chain.listKeys('p/', { withValues: false });
    expect(get).toHaveBeenCalledWith('/data/keys?prefix=p%2F');
  });

  it('returns the array of KeyEntry rows verbatim', async () => {
    const rows = [
      { key: 'alice.near/profile/name', block_height: '123' },
      { key: 'alice.near/profile/bio', block_height: '124' },
    ];
    const get = vi.fn().mockResolvedValue(rows);
    const chain = new ChainModule({ get } as never);
    const out = await chain.listKeys('alice.near/profile/');
    expect(out).toEqual(rows);
  });
});

describe('ChainModule.countKeys', () => {
  it('queries /data/count and unwraps the count field', async () => {
    const get = vi.fn().mockResolvedValue({ count: 42 });
    const chain = new ChainModule({ get } as never);
    const n = await chain.countKeys('alice.near/posts/');
    expect(get).toHaveBeenCalledWith(
      '/data/count?prefix=alice.near%2Fposts%2F'
    );
    expect(n).toBe(42);
  });
});
