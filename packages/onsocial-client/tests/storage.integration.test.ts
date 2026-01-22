// tests/storage.integration.test.ts
// Integration test for storage via onsocial-backend

import { describe, it, expect, beforeAll } from 'vitest';
import { StorageClient } from '../src/storage';

describe('StorageClient Integration', () => {
  let storage: StorageClient;

  beforeAll(() => {
    storage = new StorageClient();
  });

  it('should upload and download JSON', async () => {
    const testData = { test: true, timestamp: Date.now() };

    const { cid } = await storage.uploadJSON(testData);
    expect(cid).toMatch(/^baf/); // CIDv1 starts with baf

    await new Promise((r) => setTimeout(r, 2000));

    const downloaded = await storage.downloadJSON<typeof testData>(cid);
    expect(downloaded.test).toBe(true);
    expect(downloaded.timestamp).toBe(testData.timestamp);
  }, 60000);

  it('should generate correct gateway URL', () => {
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    const url = storage.getUrl(cid);
    expect(url).toBe(`https://gateway.lighthouse.storage/ipfs/${cid}`);
  });
});
