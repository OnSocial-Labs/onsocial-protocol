// tests/storage.integration.test.ts
// Integration test for Lighthouse storage (runs in CI with real API)

import { describe, it, expect, beforeAll } from 'vitest';
import { StorageClient } from '../src/storage';

const LIGHTHOUSE_API_KEY = process.env.LIGHTHOUSE_API_KEY;

// Skip if no API key (local dev without key)
const describeIf = LIGHTHOUSE_API_KEY ? describe : describe.skip;

describeIf('StorageClient Integration', () => {
  let storage: StorageClient;

  beforeAll(() => {
    storage = new StorageClient({ apiKey: LIGHTHOUSE_API_KEY! });
  });

  it('should get balance', async () => {
    const balance = await storage.getBalance();
    expect(balance.limit).toBeGreaterThan(0);
    expect(balance.remaining).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should upload and download text', async () => {
    const testContent = `Test from OnSocial at ${new Date().toISOString()}`;

    const { cid, size } = await storage.uploadText(testContent, 'test.txt');
    expect(cid).toMatch(/^baf/); // CIDv1 starts with baf (bafy, bafk, bafkrei, etc.)
    expect(size).toBeGreaterThan(0);

    // Wait a moment for propagation
    await new Promise((r) => setTimeout(r, 2000));

    const downloaded = await storage.downloadText(cid);
    expect(downloaded).toBe(testContent);
  }, 60000);

  it('should upload and download JSON', async () => {
    const testData = { test: true, timestamp: Date.now() };

    const { cid } = await storage.uploadJSON(testData, 'test.json');
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
