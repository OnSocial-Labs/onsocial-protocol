import { describe, it, expect, vi, beforeEach } from 'vitest';
import nacl from 'tweetnacl';
import tweetnacl_util from 'tweetnacl-util';

const { encodeBase64 } = tweetnacl_util;

// Mock external dependencies before importing modules
vi.mock('../../src/rpc/index.js', () => ({
  rpcQuery: vi.fn(),
  nearRpc: { call: vi.fn() },
}));

vi.mock('../../src/tiers/index.js', () => ({
  getTierInfo: vi.fn().mockResolvedValue({ tier: 'free', rateLimit: 60 }),
  clearTierCache: vi.fn(),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    jwtSecret: 'test-secret-key-for-tests',
    jwtExpiresIn: '1h',
    nodeEnv: 'development',
    nearNetwork: 'testnet',
    nearRpcUrl: 'https://rpc.testnet.near.org',
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { verifyNearSignature, generateToken, verifyToken } from '../../src/auth/index.js';
import { rpcQuery } from '../../src/rpc/index.js';

describe('verifyNearSignature', () => {
  const keyPair = nacl.sign.keyPair();
  const publicKeyBase64 = `ed25519:${encodeBase64(keyPair.publicKey)}`;

  function signMessage(message: string): string {
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
    return encodeBase64(signature);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid message format', async () => {
    const result = await verifyNearSignature(
      'alice.testnet',
      'wrong prefix',
      signMessage('wrong prefix'),
      publicKeyBase64,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid message format');
  });

  it('rejects expired message', async () => {
    const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 min ago
    const message = `OnSocial Auth: ${oldTimestamp}`;
    const result = await verifyNearSignature(
      'alice.testnet',
      message,
      signMessage(message),
      publicKeyBase64,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Message has expired');
  });

  it('rejects invalid signature', async () => {
    const message = `OnSocial Auth: ${Date.now()}`;
    const fakeSignature = encodeBase64(new Uint8Array(64)); // all zeros

    const result = await verifyNearSignature(
      'alice.testnet',
      message,
      fakeSignature,
      publicKeyBase64,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('rejects when key does not belong to account', async () => {
    const message = `OnSocial Auth: ${Date.now()}`;

    vi.mocked(rpcQuery).mockResolvedValue({
      keys: [{ public_key: 'ed25519:OTHER_KEY' }],
    });

    const result = await verifyNearSignature(
      'alice.testnet',
      message,
      signMessage(message),
      publicKeyBase64,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Public key does not belong to account');
  });

  it('accepts valid signature with matching key', async () => {
    const message = `OnSocial Auth: ${Date.now()}`;

    vi.mocked(rpcQuery).mockResolvedValue({
      keys: [{ public_key: publicKeyBase64 }],
    });

    const result = await verifyNearSignature(
      'alice.testnet',
      message,
      signMessage(message),
      publicKeyBase64,
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('does NOT bypass verification in development mode', async () => {
    // This is the critical test: even with nodeEnv='development',
    // verification must still run (we removed the bypass)
    const result = await verifyNearSignature(
      'alice.testnet',
      'OnSocial Auth: invalid-timestamp',
      'invalid-signature',
      'ed25519:invalid',
    );
    expect(result.valid).toBe(false);
  });
});

describe('JWT tokens', () => {
  it('generates and verifies a valid token', async () => {
    const token = await generateToken('bob.testnet');
    expect(token).toBeTruthy();

    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.accountId).toBe('bob.testnet');
    expect(payload!.tier).toBe('free');
  });

  it('returns null for invalid token', () => {
    expect(verifyToken('garbage.token.data')).toBeNull();
  });

  it('returns null for tampered token', async () => {
    const token = await generateToken('bob.testnet');
    // Flip a character
    const tampered = token.slice(0, -2) + 'xx';
    expect(verifyToken(tampered)).toBeNull();
  });
});
