// tests/storage.test.ts
// Tests for the StorageClient

import { describe, it, expect } from 'vitest';
import { StorageClient } from '../src';

const DEFAULT_GATEWAY = 'https://gateway.lighthouse.storage';

describe('StorageClient', () => {
  it('should create client with default config', () => {
    const client = new StorageClient();
    expect(client).toBeDefined();
  });

  it('should create client with custom config', () => {
    const client = new StorageClient({
      endpoint: 'https://custom.api.io',
      gateway: 'https://custom.gateway.io',
    });
    expect(client).toBeDefined();
  });

  it('should use default gateway URL', () => {
    const client = new StorageClient();
    expect(client.getUrl('bafytest')).toBe(`${DEFAULT_GATEWAY}/ipfs/bafytest`);
  });

  it('should use custom gateway URL', () => {
    const client = new StorageClient({
      gateway: 'https://custom.gateway.io',
    });
    expect(client.getUrl('bafytest')).toBe('https://custom.gateway.io/ipfs/bafytest');
  });

  it('should generate correct gateway URL for CID', () => {
    const client = new StorageClient();
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const url = client.getUrl(cid);
    expect(url).toBe(`${DEFAULT_GATEWAY}/ipfs/${cid}`);
  });
});

describe('StorageClient types', () => {
  it('should export StorageClient and types', async () => {
    const { StorageClient } = await import('../src/storage');

    expect(StorageClient).toBeDefined();
  });
});
