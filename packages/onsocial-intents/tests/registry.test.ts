/**
 * Tests for TokenRegistry — dynamic token discovery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenRegistry } from '../src/registry';
import type { Token } from '../src/types';

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_TOKENS: Token[] = [
  {
    assetId: 'nep141:wrap.near',
    decimals: 24,
    blockchain: 'near',
    symbol: 'wNEAR',
    price: 2.79,
    priceUpdatedAt: '2025-03-28T12:23:00.070Z',
    contractAddress: 'wrap.near',
  },
  {
    assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    decimals: 6,
    blockchain: 'near',
    symbol: 'USDC',
    price: 1.0,
    priceUpdatedAt: '2025-03-28T12:23:00.070Z',
    contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
  },
  {
    assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
    decimals: 6,
    blockchain: 'arb',
    symbol: 'USDC',
    price: 1.0,
    priceUpdatedAt: '2025-03-28T12:23:00.070Z',
    contractAddress: 'arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
  },
  {
    assetId: 'nep141:usdt.tether-token.near',
    decimals: 6,
    blockchain: 'near',
    symbol: 'USDT',
    price: 1.0,
    priceUpdatedAt: '2025-03-28T12:23:00.070Z',
    contractAddress: 'usdt.tether-token.near',
  },
];

// ── Setup ───────────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(MOCK_TOKENS),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TokenRegistry', () => {
  it('fetches tokens from the API', async () => {
    const registry = new TokenRegistry();
    const tokens = await registry.getTokens();
    expect(tokens).toHaveLength(4);
    expect(fetch).toHaveBeenCalledWith('https://1click.chaindefuser.com/v0/tokens');
  });

  it('caches tokens on second call', async () => {
    const registry = new TokenRegistry();
    await registry.getTokens();
    await registry.getTokens();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after invalidate()', async () => {
    const registry = new TokenRegistry();
    await registry.getTokens();
    registry.invalidate();
    await registry.getTokens();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses custom base URL', async () => {
    const registry = new TokenRegistry({ baseUrl: 'https://custom.api' });
    await registry.getTokens();
    expect(fetch).toHaveBeenCalledWith('https://custom.api/v0/tokens');
  });

  it('throws on failed fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    const registry = new TokenRegistry();
    await expect(registry.getTokens()).rejects.toThrow('Failed to fetch tokens');
  });
});

describe('TokenRegistry.findBySymbol', () => {
  it('finds all USDC tokens (multiple chains)', async () => {
    const registry = new TokenRegistry();
    const results = await registry.findBySymbol('USDC');
    expect(results).toHaveLength(2);
  });

  it('is case-insensitive', async () => {
    const registry = new TokenRegistry();
    const results = await registry.findBySymbol('usdc');
    expect(results).toHaveLength(2);
  });

  it('filters by chain', async () => {
    const registry = new TokenRegistry();
    const results = await registry.findBySymbol('USDC', 'near');
    expect(results).toHaveLength(1);
    expect(results[0].blockchain).toBe('near');
  });

  it('returns empty for unknown symbol', async () => {
    const registry = new TokenRegistry();
    const results = await registry.findBySymbol('DOESNOTEXIST');
    expect(results).toHaveLength(0);
  });
});

describe('TokenRegistry.findByAssetId', () => {
  it('finds exact token', async () => {
    const registry = new TokenRegistry();
    const token = await registry.findByAssetId('nep141:wrap.near');
    expect(token).toBeDefined();
    expect(token!.symbol).toBe('wNEAR');
  });

  it('returns undefined for unknown assetId', async () => {
    const registry = new TokenRegistry();
    const token = await registry.findByAssetId('does-not-exist');
    expect(token).toBeUndefined();
  });
});

describe('TokenRegistry.findByChain', () => {
  it('finds all NEAR-chain tokens', async () => {
    const registry = new TokenRegistry();
    const results = await registry.findByChain('near');
    expect(results).toHaveLength(3);
  });

  it('finds Arbitrum tokens', async () => {
    const registry = new TokenRegistry();
    const results = await registry.findByChain('arb');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('USDC');
  });
});

describe('TokenRegistry.findByContract', () => {
  it('finds by contract address', async () => {
    const registry = new TokenRegistry();
    const results = await registry.findByContract('wrap.near');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('wNEAR');
  });
});

describe('TokenRegistry.resolve', () => {
  it('resolves a single token', async () => {
    const registry = new TokenRegistry();
    const token = await registry.resolve('USDT');
    expect(token.symbol).toBe('USDT');
  });

  it('resolves by symbol + chain', async () => {
    const registry = new TokenRegistry();
    const token = await registry.resolve('USDC', 'arb');
    expect(token.blockchain).toBe('arb');
  });

  it('throws for unknown token', async () => {
    const registry = new TokenRegistry();
    await expect(registry.resolve('INVALID')).rejects.toThrow('Token not found');
  });

  it('returns deterministic result for multi-match', async () => {
    const registry = new TokenRegistry();
    const token = await registry.resolve('USDC');
    // Should be stable (sorted by assetId)
    const token2 = await registry.resolve('USDC');
    expect(token.assetId).toBe(token2.assetId);
  });
});
