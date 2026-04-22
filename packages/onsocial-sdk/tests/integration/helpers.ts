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
import { fileURLToPath } from 'node:url';
import { OnSocial } from '../../src/client.js';

// ── Environment ────────────────────────────────────────────────────────────

export const GATEWAY_URL =
  process.env.GATEWAY_URL || 'https://testnet.onsocial.id';
export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test01.onsocial.testnet';
export const CREDS_FILE =
  process.env.CREDS_FILE ||
  path.join(process.env.HOME!, `.near-credentials/testnet/${ACCOUNT_ID}.json`);

function resolveRootEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];

  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const envFile = path.resolve(here, '../../../../.env');
    const content = fs.readFileSync(envFile, 'utf8');

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq <= 0) continue;

      const key = line.slice(0, eq).trim();
      if (key !== name) continue;

      const value = line.slice(eq + 1).trim();
      process.env[name] = value;
      return value;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

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
const PARTNER_KEY = resolveRootEnvVar('ONSOCIAL_PARTNER_API_KEY');

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
let _partnerClient: OnSocial | null = null;
const _sessionClientsByAccount = new Map<string, OnSocial>();
const _apiKeyClientsByAccount = new Map<string, OnSocial>();
const _apiKeyInfoByAccount = new Map<string, { key: string; prefix: string }>();

function credsFileForAccount(accountId: string): string {
  return path.join(path.dirname(CREDS_FILE), `${accountId}.json`);
}

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

async function getSessionClientForAccount(
  accountId: string
): Promise<OnSocial> {
  if (accountId === ACCOUNT_ID) return getSessionClient();

  const cached = _sessionClientsByAccount.get(accountId);
  if (cached) return cached;

  const keypair = loadKeypair(credsFileForAccount(accountId));
  const os = new OnSocial({
    gatewayUrl: GATEWAY_URL,
    network: 'testnet',
  });

  const challengeRes = await os.http.post<{
    challenge: { message: string; recipient: string; nonce: string };
  }>('/auth/challenge', { accountId });

  const { message, recipient, nonce } = challengeRes.challenge;
  const signature = signNep413(message, nonce, recipient, keypair.secretKey);

  await os.auth.login({
    accountId,
    publicKey: keypair.publicKey,
    signature,
    message,
  });

  _sessionClientsByAccount.set(accountId, os);
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

export async function getClientForAccount(
  accountId: string
): Promise<OnSocial> {
  if (accountId === ACCOUNT_ID) return getClient();

  const cached = _apiKeyClientsByAccount.get(accountId);
  if (cached) return cached;

  if (SERVICE_KEY) {
    const client = new OnSocial({
      gatewayUrl: GATEWAY_URL,
      network: 'testnet',
      apiKey: SERVICE_KEY,
      actorId: accountId,
    });
    _apiKeyClientsByAccount.set(accountId, client);
    return client;
  }

  const session = await getSessionClientForAccount(accountId);

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
  _apiKeyInfoByAccount.set(accountId, {
    key: result.key,
    prefix: result.prefix,
  });

  const client = new OnSocial({
    gatewayUrl: GATEWAY_URL,
    network: 'testnet',
    apiKey: result.key,
  });

  _apiKeyClientsByAccount.set(accountId, client);
  return client;
}

export function getPartnerClient(): OnSocial {
  if (!PARTNER_KEY) {
    throw new Error(
      'ONSOCIAL_PARTNER_API_KEY is required for rewards integration tests'
    );
  }

  if (_partnerClient) return _partnerClient;

  _partnerClient = new OnSocial({
    gatewayUrl: GATEWAY_URL,
    network: 'testnet',
    apiKey: PARTNER_KEY,
  });

  return _partnerClient;
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

/**
 * Wait for a direct gateway or contract-style read to reflect a prior write.
 * Use this for `/data/*` or raw on-chain verification paths.
 */
export async function confirmDirect<T>(
  fn: () => Promise<T>,
  label: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  return waitFor(fn, {
    timeoutMs: opts.timeoutMs ?? 20_000,
    intervalMs: opts.intervalMs ?? 2_000,
    label: `direct ${label}`,
  });
}

/**
 * Wait for the indexed query layer to reflect a prior write.
 * Use this for `os.query.*` confirmations backed by substreams/Hasura.
 */
export async function confirmIndexed<T>(
  fn: () => Promise<T>,
  label: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  return waitFor(fn, {
    timeoutMs: opts.timeoutMs ?? 30_000,
    intervalMs: opts.intervalMs ?? 3_000,
    label: `indexed ${label}`,
  });
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

/**
 * Create a tiny fake audio blob (not playable bytes, but carries the
 * `audio/mpeg` mime type so the gateway + SDK treat it as audio for the
 * purposes of `kind` inference and `media[*].mime` indexing).
 */
export function testAudioBlob(): Blob {
  // Minimal 32-byte ID3v2 header + padding — enough for any upstream
  // that does magic-byte sniffing on mp3.
  const bytes = Buffer.from([
    0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  return new Blob([bytes], { type: 'audio/mpeg' });
}
