// ---------------------------------------------------------------------------
// Author profile enrichment for auto-generated text-cards.
//
// When a caller doesn't pass `creator.displayName` / avatar, look them up
// from the `core-onsocial` social graph contract:
//   `${accountId}/profile/name`
//   `${accountId}/profile/avatar`
//
// Cached for 60 s in memory so a burst of mints by the same author is one
// RPC call, not N. Always falls back gracefully when the lookup fails or
// the user has no profile field set yet.
//
// Avatars are frozen into the minted PNG (inlined as a data URI at compose
// time). Later profile-picture changes do not rewrite existing cards.
// ---------------------------------------------------------------------------

import { config } from '../../config/index.js';
import { rpcQuery } from '../../rpc/index.js';
import { fetchImageAsDataUri, gatewayUrl, logger } from './shared.js';

const CACHE_TTL_MS = 60_000;
const MAX_NAME_LEN = 60;
const MAX_AVATAR_LEN = 200;

interface CallFunctionResult {
  result: number[];
}

interface NameCacheEntry {
  /** Resolved name — empty string is a valid "no profile" answer. */
  name: string;
  expiresAt: number;
}

interface AvatarCacheEntry {
  /** Raw profile/avatar value (`ipfs://…`, https, or bare CID). Empty = none. */
  avatar: string;
  expiresAt: number;
}

const nameCache = new Map<string, NameCacheEntry>();
const avatarCache = new Map<string, AvatarCacheEntry>();

function coreContract(): string {
  return config.nearNetwork === 'mainnet'
    ? 'core.onsocial.near'
    : 'core.onsocial.testnet';
}

function sanitiseName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Strip control chars, collapse whitespace, hard-cap length.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return '';
  return cleaned.length > MAX_NAME_LEN
    ? cleaned.slice(0, MAX_NAME_LEN - 1) + '…'
    : cleaned;
}

function sanitiseAvatar(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return '';
  if (cleaned.length > MAX_AVATAR_LEN) return '';
  // Accept common profile media refs only — never script-like schemes.
  if (
    /^(ipfs:\/\/|https?:\/\/)/i.test(cleaned) ||
    /^[a-z0-9]+$/i.test(cleaned)
  ) {
    return cleaned;
  }
  return '';
}

async function getOne(accountId: string, key: string): Promise<unknown> {
  const args = {
    key,
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
  return decoded?.value;
}

/**
 * Resolve `${accountId}/profile/name` from core-onsocial. Returns an
 * empty string when the user has no profile name set, the lookup fails,
 * or the response is malformed. Cached for {@link CACHE_TTL_MS} ms.
 */
export async function getProfileName(accountId: string): Promise<string> {
  const cached = nameCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  let name = '';
  try {
    name = sanitiseName(await getOne(accountId, 'profile/name'));
  } catch (err) {
    logger.info(
      { accountId, err: err instanceof Error ? err.message : String(err) },
      'profileLookup: get_one name failed (falling back to accountId)'
    );
  }

  nameCache.set(accountId, { name, expiresAt: Date.now() + CACHE_TTL_MS });
  return name;
}

/**
 * Resolve `${accountId}/profile/avatar` from core-onsocial. Returns the
 * raw stored value (`ipfs://…` / https / bare CID) or empty string when
 * unset / lookup fails. Cached for {@link CACHE_TTL_MS} ms.
 */
export async function getProfileAvatar(accountId: string): Promise<string> {
  const cached = avatarCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.avatar;

  let avatar = '';
  try {
    avatar = sanitiseAvatar(await getOne(accountId, 'profile/avatar'));
  } catch (err) {
    logger.info(
      { accountId, err: err instanceof Error ? err.message : String(err) },
      'profileLookup: get_one avatar failed (omitting face)'
    );
  }

  avatarCache.set(accountId, {
    avatar,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return avatar;
}

/**
 * Turn a stored profile media ref into a fetchable HTTP URL.
 * Returns null for empty / unsupported values.
 */
export function profileMediaRefToUrl(value: string): string | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/^ipfs:\/\//i.test(cleaned)) {
    const cid = cleaned.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return cid ? gatewayUrl(cid) : null;
  }
  if (/^[a-z0-9]+$/i.test(cleaned)) return gatewayUrl(cleaned);
  return null;
}

/**
 * Resolve a creator face for permanent card rasterization.
 * Prefers an explicit `data:image/*` / media ref; otherwise looks up
 * `profile/avatar`. Soft-fails to `undefined` on fetch/lookup errors so
 * mint still succeeds without a face.
 */
export async function resolveCreatorAvatarDataUri(
  accountId: string,
  explicit?: string
): Promise<string | undefined> {
  const direct = explicit?.trim() ?? '';
  if (/^data:image\//i.test(direct)) return direct;

  const ref = direct || (await getProfileAvatar(accountId));
  const url = ref ? profileMediaRefToUrl(ref) : null;
  if (!url) return undefined;

  try {
    return await fetchImageAsDataUri(url);
  } catch (err) {
    logger.info(
      {
        accountId,
        err: err instanceof Error ? err.message : String(err),
      },
      'profileLookup: avatar fetch failed (omitting face)'
    );
    return undefined;
  }
}

/** Test seam — clears the in-memory caches. */
export function _resetProfileCache(): void {
  nameCache.clear();
  avatarCache.clear();
}
