import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import tweetnacl_util from 'tweetnacl-util';
const { decodeBase64 } = tweetnacl_util;
import { config } from '../config/index.js';
import { rpcQuery } from '../rpc/index.js';
import { getTierInfo } from '../tiers/index.js';
import { logger } from '../logger.js';
import type { JwtPayload } from '../types/index.js';

// ── Constants ─────────────────────────────────────────────────

/** Challenge validity window */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** NEP-413 message prefix */
const AUTH_PREFIX = 'OnSocial API Auth';

/** NEP-413 recipient (must match what portal passes to wallet) */
const AUTH_RECIPIENT = 'OnSocial Gateway';

// ── Challenge store ───────────────────────────────────────────

interface StoredChallenge {
  accountId: string;
  nonce: string; // base64
  message: string;
  issuedAt: string;
  expiresAt: string;
}

const challengeStore = new Map<string, StoredChallenge>();

/** Purge expired challenges periodically */
setInterval(() => {
  const now = Date.now();
  for (const [key, challenge] of challengeStore) {
    if (Date.parse(challenge.expiresAt) < now) {
      challengeStore.delete(key);
    }
  }
}, 60_000);

/**
 * Generate JWT token for authenticated user
 * Token includes tier for rate limiting without re-checking on every request
 */
export async function generateToken(accountId: string): Promise<string> {
  const tierInfo = await getTierInfo(accountId);

  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    accountId,
    tier: tierInfo.tier,
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

// ── Challenge generation ──────────────────────────────────────

export interface AuthChallenge {
  message: string;
  recipient: string;
  nonce: string; // base64
}

/**
 * Generate a server-side auth challenge for a given account.
 * The portal will pass this to wallet.signMessage().
 */
export function createAuthChallenge(accountId: string): AuthChallenge {
  const now = Date.now();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString();
  const nonce = randomBytes(32).toString('base64');

  const message = [
    AUTH_PREFIX,
    `Account: ${accountId}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
    `Expires: ${expiresAt}`,
    `Network: ${config.nearNetwork}`,
  ].join('\n');

  const challenge: StoredChallenge = {
    accountId,
    nonce,
    message,
    issuedAt,
    expiresAt,
  };

  // Key by accountId — one active challenge per account
  challengeStore.set(accountId, challenge);

  return { message, recipient: AUTH_RECIPIENT, nonce };
}

// ── NEP-413 serialization (matches backend exactly) ───────────

function encodeU32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  return new Uint8Array(buffer);
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const len = encodeU32(bytes.length);
  const out = new Uint8Array(len.length + bytes.length);
  out.set(len);
  out.set(bytes, len.length);
  return out;
}

function encodeOptionalString(value: string | null): Uint8Array {
  if (value == null) {
    return new Uint8Array([0]);
  }
  const encoded = encodeString(value);
  const out = new Uint8Array(1 + encoded.length);
  out[0] = 1;
  out.set(encoded, 1);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * Serialize NEP-413 payload and SHA-256 hash it.
 * Identical to the backend's serializeNep413Payload.
 */
function serializeNep413Payload(input: {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl: string | null;
}): Uint8Array {
  const prefix = encodeU32(2 ** 31 + 413);
  const payload = concatBytes([
    encodeString(input.message),
    input.nonce,
    encodeString(input.recipient),
    encodeOptionalString(input.callbackUrl),
  ]);

  return createHash('sha256')
    .update(Buffer.from(concatBytes([prefix, payload])))
    .digest();
}

// ── Signature verification ────────────────────────────────────

/**
 * Parse NEAR public key format
 * Format: "ed25519:<base58 or base64 encoded key>"
 */
function parsePublicKey(publicKey: string): Uint8Array | null {
  const [curve, keyData] = publicKey.split(':');

  if (curve !== 'ed25519') {
    return null;
  }

  try {
    // Try base64 first (more common in wallet-selector)
    const b64 = decodeBase64(keyData);
    if (b64.length === 32) return b64;
  } catch {
    // Not valid base64 — fall through to base58
  }

  try {
    // Try base58 (used by NEAR CLI / near-api-js)
    const b58 = base58Decode(keyData);
    if (b58.length === 32) return b58;
  } catch {
    // Not valid base58 either
  }

  return null;
}

/**
 * Simple base58 decoder for NEAR public keys
 */
function base58Decode(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes: number[] = [];

  for (const char of str) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) throw new Error('Invalid base58 character');

    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Handle leading zeros
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Verify that a public key belongs to an account via NEAR RPC
 */
async function verifyKeyBelongsToAccount(
  accountId: string,
  publicKey: string
): Promise<boolean> {
  try {
    const result = await rpcQuery<{ keys: Array<{ public_key: string }> }>({
      request_type: 'view_access_key_list',
      account_id: accountId,
      finality: 'final',
    });

    if ('keys' in result && Array.isArray(result.keys)) {
      // Compare decoded key bytes (not format-dependent strings) so
      // ed25519:<base64> and ed25519:<base58> of the same key both match.
      const incomingBytes = parsePublicKey(publicKey);
      if (!incomingBytes) return false;

      return result.keys.some((key: { public_key: string }) => {
        // Fast path: exact string match
        if (key.public_key === publicKey) return true;
        // Slow path: decode both and compare bytes
        const rpcBytes = parsePublicKey(key.public_key);
        if (!rpcBytes || rpcBytes.length !== incomingBytes.length) return false;
        return rpcBytes.every((b, i) => b === incomingBytes[i]);
      });
    }

    return false;
  } catch (error) {
    logger.error({ accountId, error }, 'Failed to verify key ownership');
    return false;
  }
}

/**
 * Verify NEAR signature against a server-issued challenge.
 * Uses the same NEP-413 serialization + SHA-256 as the backend Social Key flow.
 *
 * Steps:
 * 1. Look up stored challenge for the account
 * 2. Validate challenge hasn't expired
 * 3. Verify message matches stored challenge
 * 4. Serialize NEP-413 payload, SHA-256 hash, ed25519 verify
 * 5. Verify public key belongs to account (NEAR RPC)
 * 6. Consume the challenge (one-time use)
 */
export async function verifyNearSignature(
  accountId: string,
  message: string,
  signature: string,
  publicKey: string
): Promise<{ valid: boolean; error?: string }> {
  // Step 1: Look up stored challenge
  const challenge = challengeStore.get(accountId);
  if (!challenge) {
    return {
      valid: false,
      error: 'No active challenge — request /auth/challenge first',
    };
  }

  // Step 2: Validate expiry
  if (Date.parse(challenge.expiresAt) < Date.now()) {
    challengeStore.delete(accountId);
    return { valid: false, error: 'Challenge has expired' };
  }

  // Step 3: Verify message matches
  if (message !== challenge.message) {
    return { valid: false, error: 'Message does not match challenge' };
  }

  // Step 4: Parse inputs
  const pubKeyBytes = parsePublicKey(publicKey);
  if (!pubKeyBytes || pubKeyBytes.length !== 32) {
    return { valid: false, error: 'Invalid public key format' };
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase64(signature);
  } catch {
    return { valid: false, error: 'Invalid signature encoding' };
  }
  if (signatureBytes.length !== 64) {
    return { valid: false, error: 'Invalid signature length' };
  }

  let nonceBytes: Uint8Array;
  try {
    nonceBytes = new Uint8Array(Buffer.from(challenge.nonce, 'base64'));
  } catch {
    return { valid: false, error: 'Invalid challenge nonce' };
  }

  // Step 5: NEP-413 serialize + SHA-256 + ed25519 verify
  const messageHash = serializeNep413Payload({
    message,
    nonce: nonceBytes,
    recipient: AUTH_RECIPIENT,
    callbackUrl: null,
  });

  const isValid = nacl.sign.detached.verify(
    new Uint8Array(messageHash),
    signatureBytes,
    pubKeyBytes
  );

  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Step 6: Verify public key belongs to account
  const keyBelongsToAccount = await verifyKeyBelongsToAccount(
    accountId,
    publicKey
  );
  if (!keyBelongsToAccount) {
    return { valid: false, error: 'Public key does not belong to account' };
  }

  // Consume the challenge (one-time use)
  challengeStore.delete(accountId);

  return { valid: true };
}

/**
 * Get tier from token or default to 'free'
 */
export function getTierFromToken(
  token: string | undefined
): JwtPayload['tier'] {
  if (!token) return 'free';

  const payload = verifyToken(token);
  return payload?.tier || 'free';
}
