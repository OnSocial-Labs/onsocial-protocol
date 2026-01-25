// tests/index.test.ts
import { describe, it, expect } from 'vitest';

describe('@onsocial/client exports', () => {
  it('should export core modules', async () => {
    const { NETWORKS, GraphClient, StorageClient } = await import('../src');

    expect(NETWORKS).toBeDefined();
    expect(NETWORKS.testnet).toBeDefined();
    expect(NETWORKS.mainnet).toBeDefined();
    expect(NETWORKS.testnet.hasuraUrl).toBeDefined();
    expect(GraphClient).toBeDefined();
    expect(StorageClient).toBeDefined();
  });

  it('should export utils', async () => {
    const { isValidAccountId, parsePath, buildPath } = await import('../src');

    expect(isValidAccountId).toBeDefined();
    expect(parsePath).toBeDefined();
    expect(buildPath).toBeDefined();
  });

  it('should export Graph queries', async () => {
    const { QUERIES } = await import('../src');

    expect(QUERIES).toBeDefined();
    expect(QUERIES.GET_DATA_UPDATES).toBeDefined();
    expect(QUERIES.GET_GROUP_UPDATES).toBeDefined();
    expect(QUERIES.GET_STORAGE_UPDATES).toBeDefined();
    expect(QUERIES.GET_CURSOR).toBeDefined();
  });
});
