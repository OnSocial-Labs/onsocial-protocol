// ---------------------------------------------------------------------------
// Integration: Storage — IPFS upload + verification
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getClient,
  testImageBlob,
  cleanupApiKey,
  integrationFetch,
} from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('storage', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();
  });

  // storage is the last test file alphabetically — clean up the shared API key
  afterAll(async () => {
    await cleanupApiKey();
  });

  it('should upload a file to IPFS and return a CID', async () => {
    const blob = testImageBlob();
    const result = await os.storage.upload(blob);
    expect(result.cid).toBeTruthy();
    expect(result.cid).toMatch(/^baf/);
    expect(Number(result.size)).toBeGreaterThan(0);
  }, 60_000);

  it('should generate a valid gateway URL', async () => {
    const blob = testImageBlob();
    const { cid } = await os.storage.upload(blob);
    const url = os.storage.url(cid);
    expect(url).toContain('/ipfs/');
    expect(url).toContain(cid);
  }, 60_000);

  it('should verify uploaded media is accessible', async () => {
    const blob = testImageBlob();
    const { cid } = await os.storage.upload(blob);
    const url = os.storage.url(cid);

    const resp = await integrationFetch(url, { method: 'HEAD' });
    expect(resp.ok).toBe(true);
    expect(resp.headers.get('content-type')).toContain('image');
  }, 60_000);
});
