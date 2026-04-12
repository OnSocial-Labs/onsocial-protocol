import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
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
    refreshSecret: 'test-refresh-secret-for-tests',
    refreshExpiresIn: '7d',
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

import {
  createAuthChallenge,
  verifyNearSignature,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyToken,
} from '../../src/auth/index.js';
import { rpcQuery } from '../../src/rpc/index.js';

// ── Helpers ───────────────────────────────────────────────────

/** Reproduce the same NEP-413 serialization + SHA-256 as the gateway/backend */
function serializeAndHash(
  message: string,
  nonce: Uint8Array,
  recipient: string
): Uint8Array {
  const tag = 2 ** 31 + 413;
  const encU32 = (v: number) => {
    const b = new ArrayBuffer(4);
    new DataView(b).setUint32(0, v, true);
    return new Uint8Array(b);
  };
  const encStr = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    const len = encU32(bytes.length);
    const out = new Uint8Array(len.length + bytes.length);
    out.set(len);
    out.set(bytes, len.length);
    return out;
  };

  const prefix = encU32(tag);
  const parts = [
    encStr(message),
    nonce,
    encStr(recipient),
    new Uint8Array([0]),
  ];
  const total = prefix.length + parts.reduce((s, p) => s + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  buf.set(prefix, off);
  off += prefix.length;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }

  return new Uint8Array(createHash('sha256').update(buf).digest());
}

/** Sign a challenge exactly as the wallet + portal would */
function signChallenge(
  challenge: { message: string; recipient: string; nonce: string },
  secretKey: Uint8Array
): string {
  const nonceBytes = Uint8Array.from(atob(challenge.nonce), (c) =>
    c.charCodeAt(0)
  );
  const hash = serializeAndHash(
    challenge.message,
    nonceBytes,
    challenge.recipient
  );
  return encodeBase64(nacl.sign.detached(hash, secretKey));
}

// ── Tests ─────────────────────────────────────────────────────

describe('Challenge-based auth', () => {
  const keyPair = nacl.sign.keyPair();
  const publicKeyBase64 = `ed25519:${encodeBase64(keyPair.publicKey)}`;
  const accountId = 'alice.testnet';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: RPC returns the matching public key
    vi.mocked(rpcQuery).mockResolvedValue({
      keys: [{ public_key: publicKeyBase64 }],
    });
  });

  it('full flow: challenge → sign → verify succeeds', async () => {
    const challenge = createAuthChallenge(accountId);
    const signature = signChallenge(challenge, keyPair.secretKey);

    const result = await verifyNearSignature(
      accountId,
      challenge.message,
      signature,
      publicKeyBase64
    );
    expect(result.valid).toBe(true);
  });

  it('rejects when no challenge was issued', async () => {
    const result = await verifyNearSignature(
      'nobody.testnet',
      'fake message',
      encodeBase64(new Uint8Array(64)),
      publicKeyBase64
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid auth message format');
  });

  it('rejects when message does not match challenge', async () => {
    createAuthChallenge(accountId);

    const result = await verifyNearSignature(
      accountId,
      'tampered message',
      encodeBase64(new Uint8Array(64)),
      publicKeyBase64
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Message does not match challenge');
  });

  it('rejects invalid signature', async () => {
    const challenge = createAuthChallenge(accountId);
    const fakeSignature = encodeBase64(new Uint8Array(64));

    const result = await verifyNearSignature(
      accountId,
      challenge.message,
      fakeSignature,
      publicKeyBase64
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('rejects when key does not belong to account', async () => {
    vi.mocked(rpcQuery).mockResolvedValue({
      keys: [
        { public_key: 'ed25519:SOME_OTHER_KEY_AAAAAAAAAAAAAAAAAAAAAAAAA=' },
      ],
    });

    const challenge = createAuthChallenge(accountId);
    const signature = signChallenge(challenge, keyPair.secretKey);

    const result = await verifyNearSignature(
      accountId,
      challenge.message,
      signature,
      publicKeyBase64
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Public key does not belong to account');
  });

  it('challenge is consumed after successful verify (one-time use)', async () => {
    const challenge = createAuthChallenge(accountId);
    const signature = signChallenge(challenge, keyPair.secretKey);

    const first = await verifyNearSignature(
      accountId,
      challenge.message,
      signature,
      publicKeyBase64
    );
    expect(first.valid).toBe(true);

    // Same challenge again should fail
    const second = await verifyNearSignature(
      accountId,
      challenge.message,
      signature,
      publicKeyBase64
    );
    expect(second.valid).toBe(false);
    expect(second.error).toBe('Challenge has already been used');
  });

  it('new challenge replaces old one', async () => {
    const old = createAuthChallenge(accountId);
    const fresh = createAuthChallenge(accountId);

    // Old message should not match the fresh challenge
    const result = await verifyNearSignature(
      accountId,
      old.message,
      signChallenge(old, keyPair.secretKey),
      publicKeyBase64
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Message does not match challenge');

    // Fresh one works
    const result2 = await verifyNearSignature(
      accountId,
      fresh.message,
      signChallenge(fresh, keyPair.secretKey),
      publicKeyBase64
    );
    expect(result2.valid).toBe(true);
  });

  it('accepts valid signature with cross-format key (base58 RPC, base64 client)', async () => {
    const ALPHABET =
      '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function base58Encode(bytes: Uint8Array): string {
      const digits = [0];
      for (const byte of bytes) {
        let carry = byte;
        for (let j = 0; j < digits.length; j++) {
          carry += digits[j] << 8;
          digits[j] = carry % 58;
          carry = (carry / 58) | 0;
        }
        while (carry > 0) {
          digits.push(carry % 58);
          carry = (carry / 58) | 0;
        }
      }
      let str = '';
      for (const byte of bytes) {
        if (byte !== 0) break;
        str += '1';
      }
      for (let i = digits.length - 1; i >= 0; i--) {
        str += ALPHABET[digits[i]];
      }
      return str;
    }

    const publicKeyBase58 = `ed25519:${base58Encode(keyPair.publicKey)}`;
    vi.mocked(rpcQuery).mockResolvedValue({
      keys: [{ public_key: publicKeyBase58 }],
    });

    const challenge = createAuthChallenge(accountId);
    const signature = signChallenge(challenge, keyPair.secretKey);

    const result = await verifyNearSignature(
      accountId,
      challenge.message,
      signature,
      publicKeyBase64
    );
    expect(result.valid).toBe(true);
  });

  it('accepts a valid signed message even if the in-memory challenge store is empty', async () => {
    const now = Date.now();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = encodeBase64(nonceBytes);
    const challenge = {
      message: [
        'OnSocial API Auth',
        `Account: ${accountId}`,
        `Nonce: ${nonce}`,
        `Issued: ${issuedAt}`,
        `Expires: ${expiresAt}`,
        'Network: testnet',
      ].join('\n'),
      recipient: 'OnSocial Gateway',
      nonce,
    };

    const signature = signChallenge(challenge, keyPair.secretKey);

    const result = await verifyNearSignature(
      accountId,
      challenge.message,
      signature,
      publicKeyBase64
    );
    expect(result.valid).toBe(true);
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

describe('Refresh tokens', () => {
  it('generates and verifies a refresh token', () => {
    const token = generateRefreshToken('carol.testnet');
    expect(token).toBeTruthy();

    const result = verifyRefreshToken(token);
    expect(result).not.toBeNull();
    expect(result!.accountId).toBe('carol.testnet');
  });

  it('returns null for garbage refresh token', () => {
    expect(verifyRefreshToken('garbage.token.data')).toBeNull();
  });

  it('returns null when access token is used as refresh token', async () => {
    const accessToken = await generateToken('carol.testnet');
    // Access token has kind: 'access', not 'refresh'
    expect(verifyRefreshToken(accessToken)).toBeNull();
  });

  it('returns null for tampered refresh token', () => {
    const token = generateRefreshToken('carol.testnet');
    const tampered = token.slice(0, -2) + 'xx';
    expect(verifyRefreshToken(tampered)).toBeNull();
  });

  it('access token cannot be verified as refresh and vice versa', async () => {
    const accessToken = await generateToken('dave.testnet');
    const refreshToken = generateRefreshToken('dave.testnet');

    // Cross-verification must fail
    expect(verifyRefreshToken(accessToken)).toBeNull();
    expect(verifyToken(refreshToken)).toBeNull();
  });
});
