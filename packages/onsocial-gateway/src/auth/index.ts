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

interface ParsedAuthMessage {
  accountId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  network: string;
}

interface UsedAuthMessage {
  expiresAt: string;
}

const challengeStore = new Map<string, StoredChallenge>();
const usedMessageStore = new Map<string, UsedAuthMessage>();

/** Purge expired challenges periodically */
setInterval(() => {
  const now = Date.now();
  for (const [key, challenge] of challengeStore) {
    if (Date.parse(challenge.expiresAt) < now) {
      challengeStore.delete(key);
    }
  }

  for (const [key, usedMessage] of usedMessageStore) {
    if (Date.parse(usedMessage.expiresAt) < now) {
      usedMessageStore.delete(key);
    }
  }
}, 60_000);

function authMessageKey(accountId: string, message: string): string {
  return `${accountId}:${createHash('sha256').update(message).digest('hex')}`;
}

/**
 * Generate short-lived access JWT for authenticated user.
 * Token includes tier for rate limiting without re-checking on every request.
 */
export async function generateToken(accountId: string): Promise<string> {
  const tierInfo = await getTierInfo(accountId);

  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    accountId,
    tier: tierInfo.tier,
    kind: 'access',
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Generate long-lived refresh JWT.
 * Contains only identity — tier is re-resolved on refresh.
 */
export function generateRefreshToken(accountId: string): string {
  return jwt.sign({ accountId, kind: 'refresh' }, config.refreshSecret, {
    expiresIn: config.refreshExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Verify and decode a refresh token.
 * Returns the accountId or null if invalid/expired.
 */
export function verifyRefreshToken(
  token: string
): { accountId: string } | null {
  try {
    const payload = jwt.verify(token, config.refreshSecret) as {
      accountId?: string;
      kind?: string;
    };
    if (payload.kind !== 'refresh' || !payload.accountId) return null;
    return { accountId: payload.accountId };
  } catch {
    return null;
  }
}

/**
 * Verify and decode access JWT token.
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

function buildAuthMessage(input: {
  accountId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    AUTH_PREFIX,
    `Account: ${input.accountId}`,
    `Nonce: ${input.nonce}`,
    `Issued: ${input.issuedAt}`,
    `Expires: ${input.expiresAt}`,
    `Network: ${config.nearNetwork}`,
  ].join('\n');
}

function parseAuthMessage(message: string): ParsedAuthMessage | null {
  const lines = message.split('\n');
  if (lines.length !== 6 || lines[0] !== AUTH_PREFIX) {
    return null;
  }

  const accountId = lines[1]?.replace(/^Account: /, '');
  const nonce = lines[2]?.replace(/^Nonce: /, '');
  const issuedAt = lines[3]?.replace(/^Issued: /, '');
  const expiresAt = lines[4]?.replace(/^Expires: /, '');
  const network = lines[5]?.replace(/^Network: /, '');

  if (!accountId || !nonce || !issuedAt || !expiresAt || !network) {
    return null;
  }

  return { accountId, nonce, issuedAt, expiresAt, network };
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

  const message = buildAuthMessage({ accountId, nonce, issuedAt, expiresAt });

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
  const challenge = challengeStore.get(accountId);

  if (challenge) {
    // Verify message matches the issued challenge exactly when present.
    if (message !== challenge.message) {
      return { valid: false, error: 'Message does not match challenge' };
    }
  }

  const parsedMessage = parseAuthMessage(message);
  if (!parsedMessage) {
    return { valid: false, error: 'Invalid auth message format' };
  }

  if (parsedMessage.accountId !== accountId) {
    return { valid: false, error: 'Auth message account mismatch' };
  }

  if (parsedMessage.network !== config.nearNetwork) {
    return { valid: false, error: 'Auth message network mismatch' };
  }

  const issuedAtMs = Date.parse(parsedMessage.issuedAt);
  const expiresAtMs = Date.parse(parsedMessage.expiresAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    return { valid: false, error: 'Invalid auth message timestamps' };
  }

  const now = Date.now();
  if (issuedAtMs > now + 60_000) {
    return { valid: false, error: 'Auth message timestamp is in the future' };
  }

  if (expiresAtMs < now) {
    return { valid: false, error: 'Challenge has expired' };
  }

  if (expiresAtMs - issuedAtMs > CHALLENGE_TTL_MS + 1_000) {
    return { valid: false, error: 'Auth message validity window is invalid' };
  }

  const usedMessageKey = authMessageKey(accountId, message);
  const usedMessage = usedMessageStore.get(usedMessageKey);
  if (usedMessage && Date.parse(usedMessage.expiresAt) >= now) {
    return { valid: false, error: 'Challenge has already been used' };
  }

  if (challenge) {
    // Step 2: Validate expiry
    if (Date.parse(challenge.expiresAt) < now) {
      challengeStore.delete(accountId);
      return { valid: false, error: 'Challenge has expired' };
    }

    usedMessageStore.delete(usedMessageKey);
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
    nonceBytes = new Uint8Array(Buffer.from(parsedMessage.nonce, 'base64'));
  } catch {
    return { valid: false, error: 'Invalid challenge nonce' };
  }

  if (nonceBytes.length !== 32) {
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

  // Consume the challenge (one-time use) when verification is tied to an issued challenge.
  if (challenge) {
    challengeStore.delete(accountId);
  }
  usedMessageStore.set(usedMessageKey, { expiresAt: parsedMessage.expiresAt });

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
