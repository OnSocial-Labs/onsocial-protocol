// tests/graph.test.ts
// Tests for the GraphClient (Hasura-native)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphClient, NETWORKS, QUERIES } from '../src';

describe('GraphClient', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should use testnet URL by default', () => {
    const client = new GraphClient();
    expect(client).toBeDefined();
  });

  it('should use mainnet URL when specified', () => {
    const client = new GraphClient({ network: 'mainnet' });
    expect(client).toBeDefined();
  });

  it('should use custom Hasura URL when provided', () => {
    const client = new GraphClient({ hasuraUrl: 'https://custom.hasura.io/v1/graphql' });
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
            operation: 'set',
            author: 'alice.near',
            path: 'alice.near/profile/name',
            value: '"Alice"',
            accountId: 'alice.near',
            dataType: 'profile',
            dataId: 'name',
            isGroupContent: false,
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
    expect(updates[0].operation).toBe('set');
  });

  it('should fetch storage updates', async () => {
    const mockData = {
      data: {
        storageUpdates: [
          {
            id: '1',
            blockHeight: '100',
            blockTimestamp: '1234567890',
            receiptId: 'receipt1',
            operation: 'deposit',
            author: 'alice.near',
            amount: '1000000000000000000000000',
            targetId: 'alice.near',
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const client = new GraphClient({ network: 'testnet' });
    const updates = await client.getStorageUpdates('alice.near');

    expect(updates).toHaveLength(1);
    expect(updates[0].operation).toBe('deposit');
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
      statusText: 'Internal Server Error',
    });

    const client = new GraphClient({ network: 'testnet' });

    await expect(client.getDataUpdates('alice.near')).rejects.toThrow('Hasura request failed: 500');
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

  it('should parse value field', () => {
    const client = new GraphClient();
    const update = {
      id: '1',
      blockHeight: '100',
      blockTimestamp: '1234567890',
      receiptId: 'receipt1',
      operation: 'set' as const,
      author: 'alice.near',
      path: 'alice.near/profile',
      value: '{"name":"Alice","bio":"Hello"}',
      accountId: 'alice.near',
      dataType: 'profile',
      dataId: null,
      groupId: null,
      groupPath: null,
      isGroupContent: false,
      targetAccount: null,
      parentPath: null,
      parentAuthor: null,
      parentType: null,
      refPath: null,
      refAuthor: null,
      refType: null,
      refs: null,
      refAuthors: null,
      derivedId: null,
      derivedType: null,
      writes: null,
      partitionId: null,
    };

    const result = client.parseValue<{ name: string; bio: string }>(update);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
      expect(result.data.bio).toBe('Hello');
    }
  });

  it('should get indexer status', async () => {
    const mockData = {
      data: {
        cursors: [
          {
            id: 'default',
            cursor: 'abc123',
            blockNum: '180000000',
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const client = new GraphClient({ network: 'testnet' });
    const status = await client.getIndexerStatus();

    expect(status).not.toBeNull();
    expect(status?.blockNum).toBe('180000000');
  });
});

describe('QUERIES', () => {
  it('should export Hasura-style queries', () => {
    expect(QUERIES.GET_DATA_UPDATES).toContain('dataUpdates');
    expect(QUERIES.GET_DATA_UPDATES).toContain('_eq'); // Hasura syntax
    expect(QUERIES.GET_DATA_BY_TYPE).toContain('dataType');
    expect(QUERIES.GET_RECENT_ACTIVITY).toContain('orderBy');
    expect(QUERIES.GET_STORAGE_UPDATES).toContain('storageUpdates');
    expect(QUERIES.GET_GROUP_UPDATES).toContain('groupUpdates');
    expect(QUERIES.GET_CURSOR).toContain('cursors');
  });
});

describe('NETWORKS', () => {
  it('should have testnet config with Hasura URL', () => {
    expect(NETWORKS.testnet).toBeDefined();
    expect(NETWORKS.testnet.hasuraUrl).toBeDefined();
    expect(NETWORKS.testnet.rpcUrl).toBeDefined();
    expect(NETWORKS.testnet.contractId).toBe('core.onsocial.testnet');
  });

  it('should have mainnet config', () => {
    expect(NETWORKS.mainnet).toBeDefined();
    expect(NETWORKS.mainnet.contractId).toBe('core.onsocial.near');
    expect(NETWORKS.mainnet.hasuraUrl).toBeDefined();
  });
});
