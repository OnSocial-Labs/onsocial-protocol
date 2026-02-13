// tests/integration/setup.ts
// Shared helpers for integration tests (run against a live gateway)

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { KeyPair } from 'near-api-js';
import tweetnacl_util from 'tweetnacl-util';
const { encodeBase64 } = tweetnacl_util;

export const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

/**
 * Test account credentials.
 *
 * Loaded from ~/.near-credentials/testnet/ at runtime — never hardcoded.
 * Override the account via TEST_ACCOUNT_ID env var (default: test01.onsocial.testnet).
 * Or supply TEST_PUBLIC_KEY + TEST_PRIVATE_KEY directly (e.g. in CI).
 */
const TEST_ACCOUNT_ID = process.env.TEST_ACCOUNT_ID || 'test01.onsocial.testnet';

function loadCredentials(): { publicKey: string; privateKey: string } {
  // Prefer explicit env vars (for CI)
  if (process.env.TEST_PUBLIC_KEY && process.env.TEST_PRIVATE_KEY) {
    return {
      publicKey: process.env.TEST_PUBLIC_KEY,
      privateKey: process.env.TEST_PRIVATE_KEY,
    };
  }

  // Read from local NEAR credentials file
  const network = process.env.NEAR_NETWORK || 'testnet';
  const credPath = join(homedir(), '.near-credentials', network, `${TEST_ACCOUNT_ID}.json`);
  try {
    const raw = JSON.parse(readFileSync(credPath, 'utf-8'));
    return { publicKey: raw.public_key, privateKey: raw.private_key };
  } catch {
    throw new Error(
      `Cannot load NEAR credentials for ${TEST_ACCOUNT_ID} from ${credPath}.\n` +
        'Either create the key file or set TEST_PUBLIC_KEY + TEST_PRIVATE_KEY env vars.',
    );
  }
}

const creds = loadCredentials();

/**
 * Obtain a valid JWT by performing a real NEAR signature-based login.
 * Caches the token for the lifetime of the test suite.
 */
let _cachedToken: string | null = null;

export async function getAuthToken(): Promise<string> {
  if (_cachedToken) return _cachedToken;

  const message = `OnSocial Auth: ${new Date().toISOString()}`;
  const keyPair = KeyPair.fromString(creds.privateKey);
  const messageBytes = new TextEncoder().encode(message);
  const { signature } = keyPair.sign(messageBytes);
  const signatureB64 = encodeBase64(signature);

  const res = await fetch(`${GATEWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: TEST_ACCOUNT_ID,
      message,
      signature: signatureB64,
      publicKey: creds.publicKey,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth login failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { token: string };
  _cachedToken = data.token;
  return _cachedToken;
}

/** Headers with a valid JWT for authenticated endpoints. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/** The test account ID (for assertions). */
export { TEST_ACCOUNT_ID };

/**
 * Fetch with retry for cold start tolerance.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 3,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10_000),
      });
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Fetch failed after retries');
}
