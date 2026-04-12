import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import tweetnacl_util from 'tweetnacl-util';
const { decodeBase64 } = tweetnacl_util;
import { config } from '../config/index.js';
import { rpcQuery } from '../rpc/index.js';
import { getTierInfo } from '../tiers/index.js';
import { logger } from '../logger.js';
import type { JwtPayload } from '../types/index.js';

// Message validity window (5 minutes)
const MESSAGE_VALIDITY_MS = 5 * 60 * 1000;

// Expected message prefix
const MESSAGE_PREFIX = 'OnSocial Auth: ';

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

/**
 * Parse and validate the auth message format and timestamp
 * Message format: "OnSocial Auth: <timestamp>"
 * Timestamp can be ISO-8601, unix seconds, or unix milliseconds.
 */
function parseAuthTimestamp(timestampStrRaw: string): number | null {
  const timestampStr = timestampStrRaw.trim();
  if (!timestampStr) return null;

  // 1) ISO-8601 or other Date.parse-able formats
  const parsed = Date.parse(timestampStr);
  if (!isNaN(parsed)) return parsed;

  // 2) Unix seconds / milliseconds (numeric)
  if (!/^[0-9]+$/.test(timestampStr)) return null;
  const asNumber = Number(timestampStr);
  if (!Number.isFinite(asNumber)) return null;

  // Heuristic: < 1e12 is seconds, otherwise ms.
  if (asNumber < 1e12) return Math.floor(asNumber * 1000);
  return Math.floor(asNumber);
}

function validateMessage(message: string): { valid: boolean; error?: string } {
  if (!message.startsWith(MESSAGE_PREFIX)) {
    return { valid: false, error: 'Invalid message format' };
  }

  const timestampStr = message.slice(MESSAGE_PREFIX.length);
  const timestamp = parseAuthTimestamp(timestampStr);
  if (timestamp === null)
    return { valid: false, error: 'Invalid timestamp in message' };

  const now = Date.now();
  const age = now - timestamp;

  if (age < -60000) {
    // Allow 1 minute clock skew into the future
    return { valid: false, error: 'Message timestamp is in the future' };
  }

  if (age > MESSAGE_VALIDITY_MS) {
    return { valid: false, error: 'Message has expired' };
  }

  return { valid: true };
}

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
 * Build NEP-413 Borsh-serialized payload for signature verification.
 *
 * NEP-413 AuthenticationToken:
 *   tag:          u32 LE (2**31 + 413 = 2147484061)
 *   message:      u32 LE length + UTF-8 bytes
 *   nonce:        32 bytes
 *   recipient:    u32 LE length + UTF-8 bytes
 *   callback_url: Option<String> (1 byte: 0 = None)
 */
function buildNep413Payload(
  message: string,
  nonce: Uint8Array,
  recipient: string
): Uint8Array {
  const tag = 2147484061; // 2^31 + 413
  const msgBytes = new TextEncoder().encode(message);
  const recipientBytes = new TextEncoder().encode(recipient);

  // 4 (tag) + 4 (msg len) + msg + 32 (nonce) + 4 (recipient len) + recipient + 1 (None)
  const total = 4 + 4 + msgBytes.length + 32 + 4 + recipientBytes.length + 1;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  let offset = 0;

  // tag
  view.setUint32(offset, tag, true);
  offset += 4;

  // message
  view.setUint32(offset, msgBytes.length, true);
  offset += 4;
  buf.set(msgBytes, offset);
  offset += msgBytes.length;

  // nonce
  buf.set(nonce, offset);
  offset += 32;

  // recipient
  view.setUint32(offset, recipientBytes.length, true);
  offset += 4;
  buf.set(recipientBytes, offset);
  offset += recipientBytes.length;

  // callback_url: None
  buf[offset] = 0;

  return buf;
}

/**
 * Verify NEAR signature for authentication
 * Client signs a message with their NEAR private key
 *
 * Supports two modes:
 * 1. Plain: signature over raw UTF-8 message bytes
 * 2. NEP-413: signature over Borsh-serialized payload (when nonce + recipient provided)
 *
 * Verification steps:
 * 1. Validate message format and timestamp freshness (within 5 minutes)
 * 2. Verify public key belongs to the account (via NEAR RPC)
 * 3. Verify signature is valid for the message using ed25519
 */
export async function verifyNearSignature(
  accountId: string,
  message: string,
  signature: string,
  publicKey: string,
  nonce?: string,
  recipient?: string
): Promise<{ valid: boolean; error?: string }> {
  // Step 1: Validate message format and timestamp
  const messageValidation = validateMessage(message);
  if (!messageValidation.valid) {
    return messageValidation;
  }

  // Step 2: Parse and verify signature
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

  // Step 3: Verify ed25519 signature
  // If nonce + recipient provided, verify against NEP-413 Borsh payload
  // Otherwise verify against plain UTF-8 message bytes
  let messageBytes: Uint8Array;
  if (nonce && recipient) {
    let nonceBytes: Uint8Array;
    try {
      nonceBytes = decodeBase64(nonce);
    } catch {
      return { valid: false, error: 'Invalid nonce encoding' };
    }
    if (nonceBytes.length !== 32) {
      return { valid: false, error: 'Nonce must be 32 bytes' };
    }
    messageBytes = buildNep413Payload(message, nonceBytes, recipient);
  } else {
    messageBytes = new TextEncoder().encode(message);
  }

  const isValidSignature = nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    pubKeyBytes
  );

  if (!isValidSignature) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Step 4: Verify public key belongs to account
  const keyBelongsToAccount = await verifyKeyBelongsToAccount(
    accountId,
    publicKey
  );
  if (!keyBelongsToAccount) {
    return { valid: false, error: 'Public key does not belong to account' };
  }

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
