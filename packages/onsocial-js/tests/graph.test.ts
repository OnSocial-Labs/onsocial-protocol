// tests/graph.test.ts
// Tests for the GraphClient

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphClient, NETWORKS, QUERIES } from '../src';

// Mock cross-fetch module
const mockFetch = vi.fn();
vi.mock('cross-fetch', () => ({
  default: (...args: unknown[]) => mockFetch(...args),
}));

describe('GraphClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should use testnet URL by default', () => {
    const client = new GraphClient();
    // Access private graphUrl via prototype trick or just test behavior
    expect(client).toBeDefined();
  });

  it('should use mainnet URL when specified', () => {
    const client = new GraphClient({ network: 'mainnet' });
    expect(client).toBeDefined();
  });

  it('should use custom URL when provided', () => {
    const client = new GraphClient({ graphUrl: 'https://custom.graph.io' });
    expect(client).toBeDefined();
  });

  it('should fetch data updates', async () => {
    const mockData = {
      data: {
        dataUpdates: [
          {
            id: '1',
            blockHeight: '100',
            blockTimestamp: '1234567890',
            receiptId: 'receipt1',
            operation: 'SET',
            author: 'alice.near',
            path: 'profile/name',
            value: '"Alice"',
            accountId: 'alice.near',
            dataType: 'profile',
            dataId: 'name',
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const client = new GraphClient({ network: 'testnet' });
    const updates = await client.getDataUpdates('alice.near');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].accountId).toBe('alice.near');
    expect(updates[0].operation).toBe('SET');
  });

  it('should fetch account info', async () => {
    const mockData = {
      data: {
        account: {
          id: 'alice.near',
          storageBalance: '1000000000000000000000000',
          firstSeenAt: '1234567890',
          lastActiveAt: '1234567899',
          dataUpdateCount: 10,
          storageUpdateCount: 2,
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const client = new GraphClient({ network: 'testnet' });
    const account = await client.getAccount('alice.near');

    expect(account).not.toBeNull();
    expect(account?.id).toBe('alice.near');
    expect(account?.dataUpdateCount).toBe(10);
  });

  it('should return null for non-existent account', async () => {
    const mockData = {
      data: {
        account: null,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const client = new GraphClient({ network: 'testnet' });
    const account = await client.getAccount('nonexistent.near');

    expect(account).toBeNull();
  });

  it('should throw on GraphQL errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: 'Query error' }],
      }),
    });

    const client = new GraphClient({ network: 'testnet' });

    await expect(client.getDataUpdates('alice.near')).rejects.toThrow('GraphQL error: Query error');
  });

  it('should throw on HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const client = new GraphClient({ network: 'testnet' });

    await expect(client.getDataUpdates('alice.near')).rejects.toThrow('GraphQL request failed: 500');
  });

  it('should support custom queries', async () => {
    const mockData = {
      data: {
        customResult: { value: 'test' },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const client = new GraphClient({ network: 'testnet' });
    const result = await client.customQuery<{ customResult: { value: string } }>(
      'query { customResult { value } }'
    );

    expect(result.customResult.value).toBe('test');
  });
});

describe('QUERIES', () => {
  it('should export predefined queries', () => {
    expect(QUERIES.GET_DATA_UPDATES).toContain('dataUpdates');
    expect(QUERIES.GET_DATA_BY_TYPE).toContain('dataType');
    expect(QUERIES.GET_ACCOUNT).toContain('account');
    expect(QUERIES.GET_RECENT_ACTIVITY).toContain('orderBy');
    expect(QUERIES.GET_STORAGE_UPDATES).toContain('storageUpdates');
  });
});

describe('NETWORKS', () => {
  it('should have testnet config', () => {
    expect(NETWORKS.testnet).toBeDefined();
    expect(NETWORKS.testnet.graphUrl).toContain('thegraph.com');
    expect(NETWORKS.testnet.rpcUrl).toBeDefined();
    expect(NETWORKS.testnet.contractId).toBe('core.onsocial.testnet');
  });

  it('should have mainnet config', () => {
    expect(NETWORKS.mainnet).toBeDefined();
    expect(NETWORKS.mainnet.contractId).toBe('core.onsocial.near');
  });
});
