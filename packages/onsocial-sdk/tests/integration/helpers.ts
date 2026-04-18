// ---------------------------------------------------------------------------
// Integration test helpers — shared across all integration test files
//
// Developer flow: NEP-413 auth → create API key → use key for everything.
// A single API key is created once and cached for the entire test run.
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { OnSocial } from '../../src/client.js';

// ── Environment ────────────────────────────────────────────────────────────

export const GATEWAY_URL =
  process.env.GATEWAY_URL || 'https://testnet.onsocial.id';
export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test01.onsocial.testnet';
export const CREDS_FILE =
  process.env.CREDS_FILE ||
  path.join(process.env.HOME!, `.near-credentials/testnet/${ACCOUNT_ID}.json`);

/** Resolve service API key: env var → GSM secret → undefined (fallback to NEP-413). */
function resolveServiceKey(): string | undefined {
  if (process.env.ONSOCIAL_API_KEY) return process.env.ONSOCIAL_API_KEY;
  try {
    const gcloud = path.join(process.env.HOME!, 'google-cloud-sdk/bin/gcloud');
    return execSync(
      `${gcloud} secrets versions access latest --secret=ONSOCIAL_SERVICE_ONAPI_KEY`,
      { encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch {
    return undefined;
  }
}

const SERVICE_KEY = resolveServiceKey();

// ── Crypto helpers ─────────────────────────────────────────────────────────

function base58Decode(s: string): Buffer {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt(0);
  for (const c of s) {
    num = num * 58n + BigInt(ALPHABET.indexOf(c));
  }
  const hex = num.toString(16).padStart(2, '0');
  return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
}

export function loadKeypair(credsFile: string) {
  const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
  const privRaw = creds.private_key.replace(/^ed25519:/, '');
  const secretKey = base58Decode(privRaw);
  const publicKey = creds.public_key as string;
  return { secretKey, publicKey, accountId: creds.account_id as string };
}

function nep413Hash(message: string, nonce: Buffer, recipient: string): Buffer {
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(2 ** 31 + 413, 0);
  const encStr = (s: string) => {
    const buf = Buffer.from(s, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(buf.length, 0);
    return Buffer.concat([len, buf]);
  };
  const payload = Buffer.concat([
    encStr(message),
    nonce,
    encStr(recipient),
    Buffer.from([0]),
  ]);
  return crypto
    .createHash('sha256')
    .update(Buffer.concat([prefix, payload]))
    .digest();
}

export function signNep413(
  message: string,
  nonceB64: string,
  recipient: string,
  secretKey: Buffer
): string {
  const nonce = Buffer.from(nonceB64, 'base64');
  const hash = nep413Hash(message, nonce, recipient);
  const seed = secretKey.subarray(0, 32);
  const sig = crypto.sign(null, hash, {
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  return Buffer.from(sig).toString('base64');
}

// ── Client factory ─────────────────────────────────────────────────────────

let _sessionClient: OnSocial | null = null;
let _apiKeyClient: OnSocial | null = null;
let _apiKeyInfo: { key: string; prefix: string } | null = null;
let _keypair: ReturnType<typeof loadKeypair> | null = null;

/**
 * Returns a JWT-authenticated session client.
 * Used internally to create/revoke API keys (key management requires JWT).
 * Exported for auth test only — all other tests should use `getClient()`.
 */
export async function getSessionClient(): Promise<OnSocial> {
  if (_sessionClient) return _sessionClient;

  _keypair = loadKeypair(CREDS_FILE);
  const os = new OnSocial({
    gatewayUrl: GATEWAY_URL,
    network: 'testnet',
  });

  const challengeRes = await os.http.post<{
    challenge: { message: string; recipient: string; nonce: string };
  }>('/auth/challenge', { accountId: ACCOUNT_ID });

  const { message, recipient, nonce } = challengeRes.challenge;
  const signature = signNep413(message, nonce, recipient, _keypair.secretKey);

  await os.auth.login({
    accountId: ACCOUNT_ID,
    publicKey: _keypair.publicKey,
    signature,
    message,
  });

  _sessionClient = os;
  return os;
}

/**
 * Returns an API-key-authenticated client — the way a real developer uses the SDK.
 *
 * When `ONSOCIAL_API_KEY` is set (e.g. a service-tier key from GSM), the SDK
 * uses it directly — no NEP-413 handshake, no per-run key creation.  The
 * `actorId` is set so writes go under the test account's namespace.
 *
 * Otherwise falls back to the NEP-413 flow: authenticate, create a
 * throw-away API key, cache it for the run.
 */
export async function getClient(): Promise<OnSocial> {
  if (_apiKeyClient) return _apiKeyClient;

  // Fast path: pre-provisioned API key (service tier, no auth race)
  const envKey = SERVICE_KEY;
  if (envKey) {
    _apiKeyInfo = { key: envKey, prefix: 'env' };
    _apiKeyClient = new OnSocial({
      gatewayUrl: GATEWAY_URL,
      network: 'testnet',
      apiKey: envKey,
      actorId: ACCOUNT_ID,
    });
    return _apiKeyClient;
  }

  // Slow path: NEP-413 → create ephemeral key
  const session = await getSessionClient();

  // Clean up stale integration-test keys to stay under the 10-key limit
  try {
    const { keys } = await listApiKeys(session);
    for (const k of keys) {
      if (k.label === 'integration-test') {
        await revokeApiKey(session, k.prefix).catch(() => {});
      }
    }
  } catch {
    // best-effort cleanup
  }

  const result = await createApiKey(session, 'integration-test');
  _apiKeyInfo = { key: result.key, prefix: result.prefix };

  _apiKeyClient = new OnSocial({
    gatewayUrl: GATEWAY_URL,
    network: 'testnet',
    apiKey: result.key,
  });

  return _apiKeyClient;
}

/** Returns the raw API key string (lazy-inits if needed). */
export async function getApiKey(): Promise<string> {
  if (_apiKeyInfo) return _apiKeyInfo.key;
  await getClient();
  return _apiKeyInfo!.key;
}

/** Revoke the shared integration test API key (requires session client). */
export async function cleanupApiKey(): Promise<void> {
  if (!_apiKeyInfo || _apiKeyInfo.prefix === 'env') return;
  try {
    const session = await getSessionClient();
    await revokeApiKey(session, _apiKeyInfo.prefix);
  } catch {
    // Best-effort cleanup
  }
  _apiKeyInfo = null;
  _apiKeyClient = null;
}

export function getKeypair() {
  if (!_keypair) _keypair = loadKeypair(CREDS_FILE);
  return _keypair;
}

// ── API Key helpers (direct HTTP) ──────────────────────────────────────────

export async function createApiKey(
  os: OnSocial,
  label = 'integration-test'
): Promise<{ key: string; prefix: string; tier: string }> {
  return os.http.post<{
    key: string;
    prefix: string;
    tier: string;
    label: string;
  }>('/developer/keys', { label });
}

export async function listApiKeys(
  os: OnSocial
): Promise<{ keys: Array<{ prefix: string; label: string }> }> {
  return os.http.get<{ keys: Array<{ prefix: string; label: string }> }>(
    '/developer/keys'
  );
}

export async function revokeApiKey(
  os: OnSocial,
  prefix: string
): Promise<void> {
  await os.http.delete(`/developer/keys/${prefix}`);
}

// ── Retry helper for indexed data ──────────────────────────────────────────

/**
 * Polls `fn` until it returns a truthy value or times out.
 * Useful for waiting on substreams indexing delay.
 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {}
): Promise<T> {
  const { timeoutMs = 30_000, intervalMs = 2_000, label = 'waitFor' } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`${label}: timed out after ${timeoutMs}ms`);
}

/** Generate a unique test ID to avoid collisions between runs. */
export function testId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a small PNG blob for upload tests. */
export function testImageBlob(): Blob {
  // 1x1 red PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
  return new Blob([png], { type: 'image/png' });
}
