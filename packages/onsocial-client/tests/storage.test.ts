// tests/storage.test.ts
// Tests for the StorageClient

import { describe, it, expect } from 'vitest';
import { StorageClient } from '../src';
import { LIGHTHOUSE_GATEWAY } from '../src/storage';

describe('StorageClient', () => {
  it('should throw error if no API key provided', () => {
    expect(() => new StorageClient({ apiKey: '' })).toThrow(
      'StorageClient requires an API key'
    );
  });

  it('should create client with API key', () => {
    const client = new StorageClient({ apiKey: 'test-api-key' });
    expect(client).toBeDefined();
  });

  it('should use default gateway URL', () => {
    const client = new StorageClient({ apiKey: 'test-api-key' });
    expect(client.getUrl('bafytest')).toBe(`${LIGHTHOUSE_GATEWAY}/ipfs/bafytest`);
  });

  it('should use custom gateway URL', () => {
    const client = new StorageClient({
      apiKey: 'test-api-key',
      gatewayUrl: 'https://custom.gateway.io',
    });
    expect(client.getUrl('bafytest')).toBe('https://custom.gateway.io/ipfs/bafytest');
  });

  it('should generate correct gateway URL for CID', () => {
    const client = new StorageClient({ apiKey: 'test-api-key' });
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const url = client.getUrl(cid);
    expect(url).toBe(`${LIGHTHOUSE_GATEWAY}/ipfs/${cid}`);
  });
});

describe('StorageClient types', () => {
  it('should export all expected types', async () => {
    const {
      StorageClient,
      LIGHTHOUSE_GATEWAY,
    } = await import('../src/storage');

    expect(StorageClient).toBeDefined();
    expect(LIGHTHOUSE_GATEWAY).toBeDefined();
    expect(typeof LIGHTHOUSE_GATEWAY).toBe('string');
  });
});
