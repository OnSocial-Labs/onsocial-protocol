/**
 * API Key service — persistent storage via Hasura/PostgreSQL in production,
 * in-memory store for dev/testnet.
 *
 * Keys are stored as sha256 hashes. The raw key is returned once on creation
 * and never stored. Lookup is O(1) via hash.
 *
 * Store selection: if HASURA_ADMIN_SECRET is set, uses Hasura mutations/queries
 * against the api_keys table. Otherwise falls back to in-memory Maps.
 */

import { createHash, randomBytes } from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import type { Tier } from '../../types/index.js';

// --- Constants ---

/** Maximum API keys per account (prevents abuse) */
const MAX_KEYS_PER_ACCOUNT = 10;

/** Regex for raw key format: onsocial_ + 32 base64url chars */
const API_KEY_REGEX = /^onsocial_[A-Za-z0-9_-]{32}$/;

// --- Types ---

export interface ApiKeyRecord {
  keyHash: string;
  keyPrefix: string;   // first 20 chars, safe for display
  accountId: string;   // NEAR account that owns it
  label: string;       // developer-chosen label
  tier: Tier;
  createdAt: number;
  revokedAt: number | null;
}

export interface CreateKeyResult {
  rawKey: string;  // returned once, never stored
  prefix: string;
  label: string;
  tier: Tier;
}

export interface ApiKeyError {
  code: 'MAX_KEYS_REACHED' | 'INVALID_FORMAT' | 'NOT_FOUND';
  message: string;
}

// --- Helpers ---

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawKey(): string {
  const rand = randomBytes(24).toString('base64url');
  return `onsocial_${rand}`;
}

/**
 * Validate raw API key format without hashing.
 * Use in middleware to reject garbage before the sha256 call.
 */
export function isValidApiKeyFormat(raw: string): boolean {
  return API_KEY_REGEX.test(raw);
}

// ============================================================================
// Store interface — implemented by both MemoryStore and HasuraStore
// ============================================================================

interface ApiKeyStore {
  create(record: ApiKeyRecord): Promise<void>;
  lookupByHash(hash: string): Promise<ApiKeyRecord | null>;
  listByAccount(accountId: string): Promise<ApiKeyRecord[]>;
  revokeByPrefix(accountId: string, prefix: string): Promise<boolean>;
  updateTier(accountId: string, tier: Tier): Promise<void>;
  countActive(accountId: string): Promise<number>;
}

// ============================================================================
// In-memory store (dev/testnet)
// ============================================================================

class MemoryStore implements ApiKeyStore {
  private keys = new Map<string, ApiKeyRecord>();
  private accountIndex = new Map<string, Set<string>>();

  private getAccountHashes(accountId: string): Set<string> {
    let set = this.accountIndex.get(accountId);
    if (!set) {
      set = new Set();
      this.accountIndex.set(accountId, set);
    }
    return set;
  }

  async create(record: ApiKeyRecord): Promise<void> {
    this.keys.set(record.keyHash, record);
    this.getAccountHashes(record.accountId).add(record.keyHash);
  }

  async lookupByHash(hash: string): Promise<ApiKeyRecord | null> {
    const r = this.keys.get(hash);
    if (!r || r.revokedAt) return null;
    return r;
  }

  async listByAccount(accountId: string): Promise<ApiKeyRecord[]> {
    const hashes = this.accountIndex.get(accountId);
    if (!hashes) return [];
    const result: ApiKeyRecord[] = [];
    for (const h of hashes) {
      const r = this.keys.get(h);
      if (r && !r.revokedAt) result.push(r);
    }
    return result;
  }

  async revokeByPrefix(accountId: string, prefix: string): Promise<boolean> {
    const hashes = this.accountIndex.get(accountId);
    if (!hashes) return false;
    for (const h of hashes) {
      const r = this.keys.get(h);
      if (r && r.keyPrefix === prefix && !r.revokedAt) {
        r.revokedAt = Date.now();
        return true;
      }
    }
    return false;
  }

  async updateTier(accountId: string, tier: Tier): Promise<void> {
    const hashes = this.accountIndex.get(accountId);
    if (!hashes) return;
    for (const h of hashes) {
      const r = this.keys.get(h);
      if (r && !r.revokedAt) r.tier = tier;
    }
  }

  async countActive(accountId: string): Promise<number> {
    const hashes = this.accountIndex.get(accountId);
    if (!hashes) return 0;
    let count = 0;
    for (const h of hashes) {
      const r = this.keys.get(h);
      if (r && !r.revokedAt) count++;
    }
    return count;
  }
}

// ============================================================================
// Hasura/PostgreSQL store (production)
// ============================================================================

class HasuraStore implements ApiKeyStore {
  private url: string;
  private secret: string;

  constructor(hasuraUrl: string, adminSecret: string) {
    this.url = hasuraUrl;
    this.secret = adminSecret;
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': this.secret,
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Hasura: ${json.errors[0].message}`);
    }
    return json.data!;
  }

  private toRecord(row: Record<string, unknown>): ApiKeyRecord {
    return {
      keyHash: row.key_hash as string,
      keyPrefix: row.key_prefix as string,
      accountId: row.account_id as string,
      label: (row.label as string) || 'default',
      tier: (row.tier as Tier) || 'free',
      createdAt: new Date(row.created_at as string).getTime(),
      revokedAt: row.revoked_at ? new Date(row.revoked_at as string).getTime() : null,
    };
  }

  async create(record: ApiKeyRecord): Promise<void> {
    await this.gql(
      `mutation($obj: api_keys_insert_input!) {
        insert_api_keys_one(object: $obj) { key_hash }
      }`,
      {
        obj: {
          key_hash: record.keyHash,
          key_prefix: record.keyPrefix,
          account_id: record.accountId,
          label: record.label,
          tier: record.tier,
        },
      },
    );
  }

  async lookupByHash(hash: string): Promise<ApiKeyRecord | null> {
    const data = await this.gql<{
      api_keys_by_pk: Record<string, unknown> | null;
    }>(
      `query($hash: String!) {
        api_keys_by_pk(key_hash: $hash) {
          key_hash key_prefix account_id label tier created_at revoked_at
        }
      }`,
      { hash },
    );
    const row = data.api_keys_by_pk;
    if (!row || row.revoked_at) return null;
    return this.toRecord(row);
  }

  async listByAccount(accountId: string): Promise<ApiKeyRecord[]> {
    const data = await this.gql<{
      api_keys: Array<Record<string, unknown>>;
    }>(
      `query($acct: String!) {
        api_keys(where: { account_id: { _eq: $acct }, revoked_at: { _is_null: true } }) {
          key_hash key_prefix account_id label tier created_at revoked_at
        }
      }`,
      { acct: accountId },
    );
    return data.api_keys.map((r) => this.toRecord(r));
  }

  async revokeByPrefix(accountId: string, prefix: string): Promise<boolean> {
    const data = await this.gql<{
      update_api_keys: { affected_rows: number };
    }>(
      `mutation($acct: String!, $prefix: String!, $now: timestamptz!) {
        update_api_keys(
          where: { account_id: { _eq: $acct }, key_prefix: { _eq: $prefix }, revoked_at: { _is_null: true } }
          _set: { revoked_at: $now }
        ) { affected_rows }
      }`,
      { acct: accountId, prefix, now: new Date().toISOString() },
    );
    return data.update_api_keys.affected_rows > 0;
  }

  async updateTier(accountId: string, tier: Tier): Promise<void> {
    await this.gql(
      `mutation($acct: String!, $tier: String!) {
        update_api_keys(
          where: { account_id: { _eq: $acct }, revoked_at: { _is_null: true } }
          _set: { tier: $tier }
        ) { affected_rows }
      }`,
      { acct: accountId, tier },
    );
  }

  async countActive(accountId: string): Promise<number> {
    const data = await this.gql<{
      api_keys_aggregate: { aggregate: { count: number } };
    }>(
      `query($acct: String!) {
        api_keys_aggregate(where: { account_id: { _eq: $acct }, revoked_at: { _is_null: true } }) {
          aggregate { count }
        }
      }`,
      { acct: accountId },
    );
    return data.api_keys_aggregate.aggregate.count;
  }
}

// ============================================================================
// Store singleton — auto-selects based on config
// ============================================================================

function createStore(): ApiKeyStore {
  if (config.hasuraAdminSecret && config.nodeEnv === 'production') {
    logger.info('API key store: Hasura/PostgreSQL');
    return new HasuraStore(config.hasuraUrl, config.hasuraAdminSecret);
  }
  if (config.nodeEnv === 'production') {
    logger.warn('HASURA_ADMIN_SECRET not set — API keys will NOT survive restarts!');
  }
  logger.info('API key store: in-memory');
  return new MemoryStore();
}

const store = createStore();

// ============================================================================
// Public API (same interface, now async)
// ============================================================================

/**
 * Create a new API key for a developer account.
 * Returns the raw key exactly once, or an error.
 */
export async function createApiKey(
  accountId: string,
  label = 'default',
): Promise<CreateKeyResult | ApiKeyError> {
  const count = await store.countActive(accountId);
  if (count >= MAX_KEYS_PER_ACCOUNT) {
    return {
      code: 'MAX_KEYS_REACHED',
      message: `Maximum of ${MAX_KEYS_PER_ACCOUNT} active keys per account`,
    };
  }

  const raw = generateRawKey();
  const hash = hashKey(raw);
  const prefix = raw.slice(0, 20);
  const sanitizedLabel = label.slice(0, 64).trim() || 'default';

  const record: ApiKeyRecord = {
    keyHash: hash,
    keyPrefix: prefix,
    accountId,
    label: sanitizedLabel,
    tier: 'free',
    createdAt: Date.now(),
    revokedAt: null,
  };

  await store.create(record);
  logger.info({ accountId, prefix, label: sanitizedLabel }, 'API key created');

  return { rawKey: raw, prefix, label: sanitizedLabel, tier: 'free' };
}

/**
 * Look up an API key by its raw value.
 * Returns null if not found, revoked, or invalid format.
 */
export async function lookupApiKey(raw: string): Promise<ApiKeyRecord | null> {
  if (!isValidApiKeyFormat(raw)) return null;
  const hash = hashKey(raw);
  return store.lookupByHash(hash);
}

/**
 * List all active keys for an account (masked — prefix + label only).
 */
export async function listApiKeys(
  accountId: string,
): Promise<Array<{ prefix: string; label: string; tier: Tier; createdAt: number }>> {
  const records = await store.listByAccount(accountId);
  return records.map((r) => ({
    prefix: r.keyPrefix,
    label: r.label,
    tier: r.tier,
    createdAt: r.createdAt,
  }));
}

/**
 * Revoke a key by its prefix. Only the owning account can revoke.
 */
export async function revokeApiKey(accountId: string, prefix: string): Promise<boolean> {
  const revoked = await store.revokeByPrefix(accountId, prefix);
  if (revoked) logger.info({ accountId, prefix }, 'API key revoked');
  return revoked;
}

/**
 * Update the tier for all active keys belonging to an account.
 * Called when the indexer detects a CREDITS_PURCHASE event.
 */
export async function updateAccountTier(accountId: string, tier: Tier): Promise<void> {
  await store.updateTier(accountId, tier);
  logger.info({ accountId, tier }, 'Account tier updated');
}
