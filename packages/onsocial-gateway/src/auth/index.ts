import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { getTierInfo } from '../tiers/index.js';
import type { JwtPayload, Tier } from '../types/index.js';

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
 * Verify NEAR signature for authentication
 * Client signs a message with their NEAR private key
 *
 * Message format: "OnSocial Auth: <timestamp>"
 * Signature: base64 encoded ed25519 signature
 *
 * This is a simplified version - in production, use near-api-js
 * wallet selector's signMessage or implement full verification
 */
export async function verifyNearSignature(
  accountId: string,
  message: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  // TODO: Implement proper NEAR signature verification
  // For now, we'll trust the client (development mode)
  // In production, verify:
  // 1. Message format and timestamp freshness
  // 2. Public key belongs to account (via RPC access_keys)
  // 3. Signature is valid for message + public key

  if (config.nodeEnv === 'development') {
    console.warn('NEAR signature verification skipped in development');
    return true;
  }

  // Production implementation would:
  // 1. Parse message, check timestamp within 5 minutes
  // 2. Query NEAR RPC for account's access keys
  // 3. Verify signature using nacl or tweetnacl

  return false;
}

/**
 * Get tier from token or default to 'free'
 */
export function getTierFromToken(token: string | undefined): Tier {
  if (!token) return 'free';

  const payload = verifyToken(token);
  return payload?.tier || 'free';
}
