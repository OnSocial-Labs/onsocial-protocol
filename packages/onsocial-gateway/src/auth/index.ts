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
  if (timestamp === null) return { valid: false, error: 'Invalid timestamp in message' };

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
    return decodeBase64(keyData);
  } catch {
    // Try base58 (used by some NEAR tools)
    try {
      return base58Decode(keyData);
    } catch {
      return null;
    }
  }
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
      return result.keys.some(
        (key: { public_key: string }) => key.public_key === publicKey
      );
    }

    return false;
  } catch (error) {
    logger.error({ accountId, error }, 'Failed to verify key ownership');
    return false;
  }
}

/**
 * Verify NEAR signature for authentication
 * Client signs a message with their NEAR private key
 *
 * Message format: "OnSocial Auth: <ISO timestamp>"
 * Signature: base64 encoded ed25519 signature
 * PublicKey: ed25519:<base64 or base58 encoded key>
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
  publicKey: string
): Promise<{ valid: boolean; error?: string }> {
  // Development/test mode: skip verification for easier testing
  if (config.nodeEnv === 'development' || config.nodeEnv === 'test') {
    logger.warn({ accountId }, 'NEAR signature verification skipped in dev/test mode');
    return { valid: true };
  }

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
  const messageBytes = new TextEncoder().encode(message);
  const isValidSignature = nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    pubKeyBytes
  );

  if (!isValidSignature) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Step 4: Verify public key belongs to account
  const keyBelongsToAccount = await verifyKeyBelongsToAccount(accountId, publicKey);
  if (!keyBelongsToAccount) {
    return { valid: false, error: 'Public key does not belong to account' };
  }

  return { valid: true };
}

/**
 * Get tier from token or default to 'free'
 */
export function getTierFromToken(token: string | undefined): JwtPayload['tier'] {
  if (!token) return 'free';

  const payload = verifyToken(token);
  return payload?.tier || 'free';
}