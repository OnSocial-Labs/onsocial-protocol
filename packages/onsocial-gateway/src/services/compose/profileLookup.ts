// ---------------------------------------------------------------------------
// Author profile enrichment for auto-generated text-cards.
//
// When a caller doesn't pass `creator.displayName` / avatar, look them up
// from the `core-onsocial` social graph contract:
//   `${accountId}/profile/name`
//   `${accountId}/profile/avatar`
//
// Cached for 60 s in memory so a burst of mints by the same author is one
// RPC call, not N.
//
// Avatars are frozen into the minted PNG (inlined as a data URI at compose
// time). Later profile-picture changes do not rewrite existing cards.
//
// Robustness: if the author has an avatar set, mint MUST bake it in.
// Lookup/fetch failures throw ComposeError(502) — never silent omit.
// ---------------------------------------------------------------------------

import { config } from '../../config/index.js';
import { rpcQuery } from '../../rpc/index.js';
import {
  ComposeError,
  fetchImageAsDataUri,
  gatewayUrl,
  logger,
} from './shared.js';

const CACHE_TTL_MS = 60_000;
const MAX_NAME_LEN = 60;
const MAX_AVATAR_LEN = 200;
const AVATAR_FETCH_ATTEMPTS = 3;
const AVATAR_FETCH_RETRY_MS = 150;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * unset. Throws {@link ComposeError} when the RPC lookup fails — callers
 * must not treat a transport error as "no avatar".
 * Cached for {@link CACHE_TTL_MS} ms on successful answers only.
 */
export async function getProfileAvatar(accountId: string): Promise<string> {
  const cached = avatarCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.avatar;

  let avatar: string;
  try {
    avatar = sanitiseAvatar(await getOne(accountId, 'profile/avatar'));
  } catch (err) {
    logger.warn(
      { accountId, err: err instanceof Error ? err.message : String(err) },
      'profileLookup: get_one avatar failed'
    );
    throw new ComposeError(
      502,
      'Could not verify creator avatar. Try listing again in a moment.'
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
 * `profile/avatar`.
 *
 * - No avatar set → `undefined` (mint without a face is fine).
 * - Avatar set → data URI, after retries.
 * - Avatar set but unusable / unfetchable → throws ComposeError(502).
 */
export async function resolveCreatorAvatarDataUri(
  accountId: string,
  explicit?: string
): Promise<string | undefined> {
  const direct = explicit?.trim() ?? '';
  if (/^data:image\//i.test(direct)) return direct;

  const ref = direct || (await getProfileAvatar(accountId));
  if (!ref) return undefined;

  const url = profileMediaRefToUrl(ref);
  if (!url) {
    logger.warn(
      { accountId, ref },
      'profileLookup: avatar ref set but not fetchable'
    );
    throw new ComposeError(
      502,
      'Creator avatar is set but could not be used on the card. Update the profile photo and try again.'
    );
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= AVATAR_FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetchImageAsDataUri(url);
    } catch (err) {
      lastErr = err;
      logger.warn(
        {
          accountId,
          attempt,
          attempts: AVATAR_FETCH_ATTEMPTS,
          err: err instanceof Error ? err.message : String(err),
        },
        'profileLookup: avatar fetch failed'
      );
      if (attempt < AVATAR_FETCH_ATTEMPTS) {
        await sleep(AVATAR_FETCH_RETRY_MS * attempt);
      }
    }
  }

  throw new ComposeError(
    502,
    `Creator has an avatar but it could not be baked into the card (${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }). Try again in a moment.`
  );
}

/** Test seam — clears the in-memory caches. */
export function _resetProfileCache(): void {
  nameCache.clear();
  avatarCache.clear();
}
