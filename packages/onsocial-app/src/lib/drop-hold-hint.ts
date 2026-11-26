/**
 * SSR hint for last-known drop holds (Show pass / use-first / #edition).
 * Not auth — hard refresh only. In-memory hold cache is empty after reload;
 * this cookie keeps frame-1 ownership aligned with the wallet account hint.
 */

import { parseWalletAccountHint } from '@/lib/wallet-account-hint';

export const APP_DROP_HOLD_HINT_COOKIE = 'os-drop-holds';

const HINT_MAX_AGE_SEC = 60 * 60 * 24 * 400;
const HOLD_HINT_MAX = 24;
/** collectionId chars safe in the cookie payload. */
const COLLECTION_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const TOKEN_ID = /^[a-z0-9][a-z0-9._:-]{0,191}$/i;

export type DropHoldHintSeed = {
  holds: boolean;
  tokenId: string | null;
};

type HoldHintState = {
  accountId: string;
  /** insertion-ordered; empty string token = settled miss */
  entries: Map<string, string>;
};

function readDocumentCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const row = part.trim();
    if (row.startsWith(prefix)) {
      return row.slice(prefix.length);
    }
  }
  return null;
}

function writeDocumentCookie(value: string | null): void {
  if (typeof document === 'undefined') return;
  if (value) {
    document.cookie = `${APP_DROP_HOLD_HINT_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${HINT_MAX_AGE_SEC}; SameSite=Lax`;
    return;
  }
  document.cookie = `${APP_DROP_HOLD_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Wire format: `account~collectionId:tokenId,collectionId:`
 * Empty token = settled not held. Newest entries last (trimmed from the front).
 */
export function serializeDropHoldHint(state: HoldHintState): string {
  const parts: string[] = [];
  for (const [collectionId, tokenId] of state.entries) {
    parts.push(`${collectionId}:${tokenId}`);
  }
  return `${state.accountId}~${parts.join(',')}`;
}

export function parseDropHoldHint(
  raw: string | null | undefined
): HoldHintState | null {
  if (raw == null || raw === '') return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // use raw
  }
  const sep = decoded.indexOf('~');
  if (sep <= 0) return null;
  const accountId = parseWalletAccountHint(decoded.slice(0, sep));
  if (!accountId) return null;
  const entries = new Map<string, string>();
  const body = decoded.slice(sep + 1);
  if (!body) return { accountId, entries };
  for (const part of body.split(',')) {
    if (!part) continue;
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const collectionId = part.slice(0, colon).trim();
    const tokenId = part.slice(colon + 1).trim();
    if (!COLLECTION_ID.test(collectionId)) continue;
    if (tokenId && !TOKEN_ID.test(tokenId)) continue;
    entries.delete(collectionId);
    entries.set(collectionId, tokenId);
    while (entries.size > HOLD_HINT_MAX) {
      const oldest = entries.keys().next().value;
      if (oldest == null) break;
      entries.delete(oldest);
    }
  }
  return { accountId, entries };
}

/** SSR / tests — hold seed for one collection when cookie matches the account. */
export function dropHoldHintForCollection(
  raw: string | null | undefined,
  accountId: string | null | undefined,
  collectionId: string
): DropHoldHintSeed | null {
  const account = parseWalletAccountHint(accountId);
  const id = collectionId.trim();
  if (!account || !id) return null;
  const state = parseDropHoldHint(raw);
  if (!state || state.accountId !== account) return null;
  if (!state.entries.has(id)) return null;
  const tokenId = state.entries.get(id) || null;
  return { holds: Boolean(tokenId), tokenId };
}

/** Clear the hold hint cookie (disconnect). */
export function clearDropHoldHintCookie(): void {
  writeDocumentCookie(null);
}

/** Persist one hold beside the in-memory cache for the next hard refresh. */
export function rememberDropHoldHint(
  accountId: string,
  collectionId: string,
  tokenId: string | null
): void {
  const account = parseWalletAccountHint(accountId);
  const id = collectionId.trim();
  if (!account || !id || !COLLECTION_ID.test(id)) return;
  const token = tokenId?.trim() || '';
  if (token && !TOKEN_ID.test(token)) return;

  const prev = parseDropHoldHint(readDocumentCookie(APP_DROP_HOLD_HINT_COOKIE));
  const entries =
    prev && prev.accountId === account
      ? new Map(prev.entries)
      : new Map<string, string>();
  entries.delete(id);
  entries.set(id, token);
  while (entries.size > HOLD_HINT_MAX) {
    const oldest = entries.keys().next().value;
    if (oldest == null) break;
    entries.delete(oldest);
  }
  writeDocumentCookie(serializeDropHoldHint({ accountId: account, entries }));
}

/** Drop one collection (or all for account) from the hint cookie. */
export function forgetDropHoldHint(
  accountId?: string | null,
  collectionId?: string | null
): void {
  if (!accountId?.trim()) {
    clearDropHoldHintCookie();
    return;
  }
  const account = parseWalletAccountHint(accountId);
  if (!account) return;
  const prev = parseDropHoldHint(readDocumentCookie(APP_DROP_HOLD_HINT_COOKIE));
  if (!prev || prev.accountId !== account) {
    clearDropHoldHintCookie();
    return;
  }
  const id = collectionId?.trim();
  if (!id) {
    clearDropHoldHintCookie();
    return;
  }
  if (!prev.entries.has(id)) return;
  prev.entries.delete(id);
  if (prev.entries.size === 0) {
    clearDropHoldHintCookie();
    return;
  }
  writeDocumentCookie(
    serializeDropHoldHint({ accountId: account, entries: prev.entries })
  );
}
