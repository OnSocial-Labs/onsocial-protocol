/**
 * Shared test helpers and mocks for compose tests.
 *
 * Each test file imports from here to avoid duplicating mock setup.
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before all imports
// ---------------------------------------------------------------------------

vi.mock('@lighthouse-web3/sdk', () => ({
  default: {
    uploadBuffer: vi.fn(),
    uploadText: vi.fn(),
  },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: {
    lighthouseApiKey: 'test-lighthouse-key',
    relayUrl: 'http://localhost:3030',
    relayApiKey: 'test-relay-key',
    nearNetwork: 'testnet',
    jwtSecret: 'test-secret',
  },
}));

vi.mock('../../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Re-exports for test files
// ---------------------------------------------------------------------------

import lighthouse from '@lighthouse-web3/sdk';
import type { UploadedFile } from '../../../src/services/compose/index.js';

export const mockUploadBuffer = vi.mocked(lighthouse.uploadBuffer);
export const mockUploadText = vi.mocked(lighthouse.uploadText);

// Mock global fetch for relay calls
export const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    fieldname: 'image',
    originalname: 'photo.jpg',
    buffer: Buffer.from('fake-image-data'),
    mimetype: 'image/jpeg',
    size: 15,
    ...overrides,
  };
}

export function mockLighthouseUpload(cid = 'QmTestCid123', size = 15) {
  mockUploadBuffer.mockResolvedValue({ data: { Hash: cid, Size: size } });
}

export function mockLighthouseText(cid = 'QmMetaCid456', size = 200) {
  mockUploadText.mockResolvedValue({ data: { Hash: cid, Size: size } });
}

export function mockRelaySuccess(txHash = 'tx_abc123') {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ tx_hash: txHash }),
  });
}

export function mockRelayFailure(status = 500, error = 'Contract error') {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  });
}
