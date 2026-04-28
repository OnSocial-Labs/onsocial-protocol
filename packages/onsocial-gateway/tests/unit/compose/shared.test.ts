/**
 * Tests for shared compose utilities: Lighthouse upload, ComposeError, intentAuth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockUploadBuffer,
  mockUploadText,
  mockLighthouseUpload,
  mockLighthouseText,
  makeFile,
} from './helpers.js';
import {
  uploadToLighthouse,
  uploadJsonToLighthouse,
  intentAuth,
  ComposeError,
  validateRoyalty,
} from '../../../src/services/compose/index.js';

describe('uploadToLighthouse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads a file and returns cid, url, size, hash', async () => {
    mockLighthouseUpload('QmPhoto123', 1024);

    const result = await uploadToLighthouse(makeFile());

    expect(mockUploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'test-lighthouse-key'
    );
    expect(result.cid).toBe('QmPhoto123');
    expect(result.size).toBe(1024);
    expect(result.url).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmPhoto123'
    );
    expect(result.hash).toBeTruthy();
    // Hash should be consistent for same content
    const result2 = await uploadToLighthouse(makeFile());
    expect(result2.hash).toBe(result.hash);
  });

  it('throws when lighthouse API key is missing', async () => {
    const { config } = await import('../../../src/config/index.js');
    const origKey = config.lighthouseApiKey;
    (config as Record<string, unknown>).lighthouseApiKey = '';

    await expect(uploadToLighthouse(makeFile())).rejects.toThrow(
      'LIGHTHOUSE_API_KEY not configured'
    );

    (config as Record<string, unknown>).lighthouseApiKey = origKey;
  });
});

describe('uploadJsonToLighthouse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads JSON and returns cid + hash', async () => {
    mockLighthouseText('QmJsonCid789', 42);

    const result = await uploadJsonToLighthouse({ name: 'Test', value: 123 });

    expect(mockUploadText).toHaveBeenCalledWith(
      JSON.stringify({ name: 'Test', value: 123 }),
      'test-lighthouse-key',
      'metadata.json'
    );
    expect(result.cid).toBe('QmJsonCid789');
    expect(result.size).toBe(42);
    expect(result.url).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmJsonCid789'
    );
    expect(result.hash).toBeTruthy();
  });
});

describe('ComposeError', () => {
  it('captures status and details', () => {
    const err = new ComposeError(422, { error: 'Invalid path' });
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ error: 'Invalid path' });
    expect(err.name).toBe('ComposeError');
    expect(err.message).toContain('Invalid path');
  });

  it('handles string details', () => {
    const err = new ComposeError(400, 'Bad request');
    expect(err.message).toBe('Bad request');
  });
});

describe('intentAuth', () => {
  it('builds an intent auth block', () => {
    const auth = intentAuth('alice.testnet');
    expect(auth).toEqual({
      type: 'intent',
      actor_id: 'alice.testnet',
      intent: {},
    });
  });
});

describe('validateRoyalty', () => {
  it('returns null for undefined royalty', () => {
    expect(validateRoyalty(undefined)).toBeNull();
  });

  it('returns null for valid royalty', () => {
    expect(validateRoyalty({ 'a.testnet': 2500 })).toBeNull();
  });

  it('returns null for multiple valid recipients', () => {
    expect(
      validateRoyalty({ 'a.testnet': 1000, 'b.testnet': 2000 })
    ).toBeNull();
  });

  it('rejects > 10 recipients', () => {
    const r: Record<string, number> = {};
    for (let i = 0; i < 11; i++) r[`r${i}.testnet`] = 100;
    expect(validateRoyalty(r)).toBe('Maximum 10 royalty recipients');
  });

  it('rejects 0 bps share', () => {
    expect(validateRoyalty({ 'a.testnet': 0 })).toBe(
      'Each royalty share must be > 0 bps'
    );
  });

  it('rejects total > 5000 bps', () => {
    expect(validateRoyalty({ 'a.testnet': 3000, 'b.testnet': 2500 })).toMatch(
      /exceeds max 5000 bps/
    );
  });

  it('accepts exactly 5000 bps total', () => {
    expect(
      validateRoyalty({ 'a.testnet': 2500, 'b.testnet': 2500 })
    ).toBeNull();
  });
});
