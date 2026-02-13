// tests/integration/storage.test.ts
// Integration tests for gateway storage endpoints

import { describe, it, expect, beforeAll } from 'vitest';
import { GATEWAY_URL, getAuthToken } from './setup.js';

describe('Storage Endpoints', () => {
  let testCid: string;
  let authToken: string;

  beforeAll(async () => {
    authToken = await getAuthToken();
  });

  describe('POST /storage/upload-json', () => {
    it('should upload JSON and return CID', async () => {
      const testData = { test: true, timestamp: Date.now() };

      const res = await fetch(`${GATEWAY_URL}/storage/upload-json`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(testData),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.cid).toMatch(/^baf/); // CIDv1 starts with baf
      expect(Number(data.size)).toBeGreaterThan(0);
      testCid = data.cid;
    });

    it('should reject empty body', async () => {
      const res = await fetch(`${GATEWAY_URL}/storage/upload-json`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: '{}',
      });

      // Empty object {} has keys, but our check is for empty body
      // Let's test with truly empty
      const res2 = await fetch(`${GATEWAY_URL}/storage/upload-json`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(res2.status).toBe(400);
    });
  });

  describe('GET /storage/health', () => {
    it('should return storage health', async () => {
      const res = await fetch(`${GATEWAY_URL}/storage/health`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.gateway).toBe('https://gateway.lighthouse.storage');
    });
  });

  describe('GET /storage/url/:cid', () => {
    it('should return gateway URL for CID', async () => {
      const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
      const res = await fetch(`${GATEWAY_URL}/storage/url/${cid}`);

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.url).toBe(`https://gateway.lighthouse.storage/ipfs/${cid}`);
    });
  });

  describe('GET /storage/:cid', () => {
    it('should download raw file', async () => {
      // Use a known CID from our upload test or a stable one
      // Wait for IPFS propagation
      await new Promise((r) => setTimeout(r, 2000));

      if (!testCid) {
        // Upload something first
        const uploadRes = await fetch(`${GATEWAY_URL}/storage/upload-json`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ test: 'download-test' }),
        });
        const uploadData = await uploadRes.json();
        testCid = uploadData.cid;
        await new Promise((r) => setTimeout(r, 2000));
      }

      const res = await fetch(`${GATEWAY_URL}/storage/${testCid}`);
      expect(res.ok).toBe(true);

      const text = await res.text();
      expect(text).toContain('test');
    }, 30000);
  });

  describe('GET /storage/:cid/json', () => {
    it('should download and parse JSON', async () => {
      if (!testCid) {
        const uploadRes = await fetch(`${GATEWAY_URL}/storage/upload-json`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ test: 'json-download-test', num: 42 }),
        });
        const uploadData = await uploadRes.json();
        testCid = uploadData.cid;
        await new Promise((r) => setTimeout(r, 2000));
      }

      const res = await fetch(`${GATEWAY_URL}/storage/${testCid}/json`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data).toHaveProperty('test');
    }, 30000);
  });

  describe('POST /storage/upload', () => {
    it('should upload file and return CID', async () => {
      const blob = new Blob(['Hello, IPFS!'], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, 'test.txt');

      const res = await fetch(`${GATEWAY_URL}/storage/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        body: formData,
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.cid).toMatch(/^baf/);
      expect(Number(data.size)).toBeGreaterThan(0);
    });

    it('should reject request without file', async () => {
      const res = await fetch(`${GATEWAY_URL}/storage/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('No file provided');
    });
  });
});
