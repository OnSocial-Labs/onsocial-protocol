// ---------------------------------------------------------------------------
// Author profile enrichment for auto-generated text-cards.
//
// When a caller doesn't pass `creator.displayName`, look it up from the
// `core-onsocial` social graph contract — `${accountId}/profile/name`.
// Cached for 60 s in memory so a burst of mints by the same author is one
// RPC call, not N. Always falls back gracefully when the lookup fails or
// the user has no profile name set yet.
//
// Text only. We deliberately do NOT fetch profile pictures: the card is a
// permanent on-chain artifact, and a baked-in raster would either break
// (PFP changes / 404s) or bloat the SVG by ~30 KB per card. The deterministic
// per-account avatar colour + initial letter is the better identity signal
// for permanent media.
// ---------------------------------------------------------------------------

import { config } from '../../config/index.js';
import { rpcQuery } from '../../rpc/index.js';
import { logger } from './shared.js';

const CACHE_TTL_MS = 60_000;
const MAX_NAME_LEN = 60;

interface CallFunctionResult {
  result: number[];
}

interface CacheEntry {
  /** Resolved name — empty string is a valid "no profile" answer. */
  name: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function coreContract(): string {
  return config.nearNetwork === 'mainnet'
    ? 'core.onsocial.near'
    : 'core.onsocial.testnet';
}

function sanitise(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Strip control chars, collapse whitespace, hard-cap length.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return '';
  return cleaned.length > MAX_NAME_LEN
    ? cleaned.slice(0, MAX_NAME_LEN - 1) + '…'
    : cleaned;
}

/**
 * Resolve `${accountId}/profile/name` from core-onsocial. Returns an
 * empty string when the user has no profile name set, the lookup fails,
 * or the response is malformed. Cached for {@link CACHE_TTL_MS} ms.
 */
export async function getProfileName(accountId: string): Promise<string> {
  const cached = cache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  let name = '';
  try {
    // Matches the `core-onsocial::get_one(key, account_id)` ABI:
    // `key` is the relative path under the account; `account_id` is the
    // owner. Mirrors the `getOne(key, accountId)` SDK helper.
    const args = {
      key: 'profile/name',
      account_id: accountId,
    };
    const raw = await rpcQuery<CallFunctionResult>({
      request_type: 'call_function',
      account_id: coreContract(),
      method_name: 'get_one',
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    const decoded = JSON.parse(Buffer.from(raw.result).toString('utf-8')) as {
      value?: unknown;
    } | null;
    name = sanitise(decoded?.value);
  } catch (err) {
    logger.info(
      { accountId, err: err instanceof Error ? err.message : String(err) },
      'profileLookup: get_one failed (falling back to accountId)'
    );
  }

  cache.set(accountId, { name, expiresAt: Date.now() + CACHE_TTL_MS });
  return name;
}

/** Test seam — clears the in-memory cache. */
export function _resetProfileCache(): void {
  cache.clear();
}
