// tests/integration/setup.ts
// Shared helpers for integration tests (run against a live gateway)

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const TEST_ACCOUNT_ID =
  process.env.TEST_ACCOUNT_ID || 'test01.onsocial.testnet';

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
  const credPath = join(
    homedir(),
    '.near-credentials',
    network,
    `${TEST_ACCOUNT_ID}.json`
  );
  try {
    const raw = JSON.parse(readFileSync(credPath, 'utf-8'));
    return { publicKey: raw.public_key, privateKey: raw.private_key };
  } catch {
    throw new Error(
      `Cannot load NEAR credentials for ${TEST_ACCOUNT_ID} from ${credPath}.\n` +
        'Either create the key file or set TEST_PUBLIC_KEY + TEST_PRIVATE_KEY env vars.'
    );
  }
}

const creds = loadCredentials();

function encodeU32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  return new Uint8Array(buffer);
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const length = encodeU32(bytes.length);
  const output = new Uint8Array(length.length + bytes.length);
  output.set(length);
  output.set(bytes, length.length);
  return output;
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

function serializeAndHashNep413(input: {
  message: string;
  nonce: Uint8Array;
  recipient: string;
}): Uint8Array {
  const prefix = encodeU32(2 ** 31 + 413);
  const payload = concatBytes([
    encodeString(input.message),
    input.nonce,
    encodeString(input.recipient),
    new Uint8Array([0]),
  ]);

  return createHash('sha256')
    .update(Buffer.from(concatBytes([prefix, payload])))
    .digest();
}

function signChallenge(challenge: {
  message: string;
  nonce: string;
  recipient: string;
}): string {
  const nonceBytes = Uint8Array.from(atob(challenge.nonce), (char) =>
    char.charCodeAt(0)
  );
  const hash = serializeAndHashNep413({
    message: challenge.message,
    nonce: nonceBytes,
    recipient: challenge.recipient,
  });
  const keyPair = KeyPair.fromString(creds.privateKey);
  const { signature } = keyPair.sign(hash);

  return encodeBase64(signature);
}

/**
 * Obtain a valid JWT by performing a real NEAR signature-based login.
 * Caches the token for the lifetime of the test suite.
 */
let _cachedToken: string | null = null;
let _cachedTokenPromise: Promise<string> | null = null;

export async function getAuthToken(): Promise<string> {
  if (_cachedToken) return _cachedToken;
  if (_cachedTokenPromise) return _cachedTokenPromise;

  _cachedTokenPromise = (async () => {
    const challengeRes = await fetch(`${GATEWAY_URL}/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: TEST_ACCOUNT_ID }),
    });

    if (!challengeRes.ok) {
      const body = await challengeRes.text();
      throw new Error(
        `Auth challenge failed (${challengeRes.status}): ${body}`
      );
    }

    const challengeData = (await challengeRes.json()) as {
      challenge: { message: string; recipient: string; nonce: string };
    };
    const signatureB64 = signChallenge(challengeData.challenge);

    const res = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: TEST_ACCOUNT_ID,
        message: challengeData.challenge.message,
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
    return data.token;
  })();

  try {
    return await _cachedTokenPromise;
  } finally {
    _cachedTokenPromise = null;
  }
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
  retries = 3
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
