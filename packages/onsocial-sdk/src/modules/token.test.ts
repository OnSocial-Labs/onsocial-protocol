import { describe, expect, it, vi } from 'vitest';
import { TokenModule } from './token.js';

describe('TokenModule.metadata', () => {
  it('GETs /data/ft-metadata and returns the body verbatim', async () => {
    const meta = {
      spec: 'ft-1.0.0',
      name: 'OnSocial',
      symbol: 'SOCIAL',
      decimals: 24,
    };
    const get = vi.fn().mockResolvedValue(meta);
    const token = new TokenModule({ get } as never);
    const out = await token.metadata();
    expect(get).toHaveBeenCalledWith('/data/ft-metadata');
    expect(out).toEqual(meta);
  });
});

describe('TokenModule.totalSupply', () => {
  it('GETs /data/ft-total-supply and returns a yocto-string', async () => {
    const get = vi.fn().mockResolvedValue('1000000000000000000000000000');
    const token = new TokenModule({ get } as never);
    const out = await token.totalSupply();
    expect(get).toHaveBeenCalledWith('/data/ft-total-supply');
    expect(out).toBe('1000000000000000000000000000');
  });
});

describe('TokenModule.balanceOf', () => {
  it('encodes accountId in the query string', async () => {
    const get = vi.fn().mockResolvedValue('42');
    const token = new TokenModule({ get } as never);
    const out = await token.balanceOf('alice.testnet');
    expect(get).toHaveBeenCalledWith(
      '/data/ft-balance-of?accountId=alice.testnet'
    );
    expect(out).toBe('42');
  });
});

describe('TokenModule.storageBalanceOf', () => {
  it('returns null when the contract returns null', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const token = new TokenModule({ get } as never);
    const out = await token.storageBalanceOf('bob.testnet');
    expect(get).toHaveBeenCalledWith(
      '/data/ft-storage-balance?accountId=bob.testnet'
    );
    expect(out).toBeNull();
  });

  it('returns the storage-balance object verbatim', async () => {
    const bal = { total: '1250000000000000000000', available: '0' };
    const get = vi.fn().mockResolvedValue(bal);
    const token = new TokenModule({ get } as never);
    const out = await token.storageBalanceOf('alice.testnet');
    expect(out).toEqual(bal);
  });
});
