/**
 * Last-good owned edition for a drop face — vault page TTL is only 30s, so
 * Show pass / #edition / hold must not wait on a cold vault peek every open.
 *
 * `undefined` = unknown; `null` = settled not held; string = token id.
 * Also mirrors into an SSR hint cookie so hard refresh keeps use-first /
 * Show pass on frame 1 (in-memory map is empty after reload).
 */

import {
  clearDropHoldHintCookie,
  forgetDropHoldHint,
  rememberDropHoldHint,
} from '@/lib/drop-hold-hint';

const HOLD_CACHE_MAX = 64;

const holdByOwnerCollection = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function holdKey(accountId: string, collectionId: string): string {
  return `${accountId.trim().toLowerCase()}\0${collectionId.trim()}`;
}

export function peekOwnedCollectionHold(
  accountId: string | null | undefined,
  collectionId: string
): string | null | undefined {
  const account = accountId?.trim();
  const id = collectionId.trim();
  if (!account || !id) return undefined;
  const key = holdKey(account, id);
  if (!holdByOwnerCollection.has(key)) return undefined;
  return holdByOwnerCollection.get(key);
}

export function rememberOwnedCollectionHold(
  accountId: string,
  collectionId: string,
  tokenId: string | null
): void {
  const account = accountId.trim();
  const id = collectionId.trim();
  if (!account || !id) return;
  const key = holdKey(account, id);
  const held = tokenId?.trim() || null;
  holdByOwnerCollection.delete(key);
  holdByOwnerCollection.set(key, held);
  while (holdByOwnerCollection.size > HOLD_CACHE_MAX) {
    const oldest = holdByOwnerCollection.keys().next().value;
    if (oldest == null) break;
    holdByOwnerCollection.delete(oldest);
  }
  rememberDropHoldHint(account, id, held);
}

export function clearOwnedCollectionHold(
  accountId?: string | null,
  collectionId?: string | null
): void {
  const account = accountId?.trim();
  const id = collectionId?.trim();
  if (!account) {
    holdByOwnerCollection.clear();
    inflight.clear();
    clearDropHoldHintCookie();
    return;
  }
  if (id) {
    const key = holdKey(account, id);
    holdByOwnerCollection.delete(key);
    inflight.delete(key);
    forgetDropHoldHint(account, id);
    return;
  }
  const prefix = `${account.toLowerCase()}\0`;
  for (const key of [...holdByOwnerCollection.keys()]) {
    if (key.startsWith(prefix)) holdByOwnerCollection.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
  forgetDropHoldHint(account);
}

/** Pointerdown / open — settle hold before the place paints when possible. */
export function warmOwnedCollectionHold(
  accountId: string | null | undefined,
  collectionId: string,
  fetchToken: (
    collectionId: string,
    accountId: string
  ) => Promise<string | null>
): void {
  const account = accountId?.trim();
  const id = collectionId.trim();
  if (!account || !id) return;
  const key = holdKey(account, id);
  if (holdByOwnerCollection.has(key) || inflight.has(key)) return;
  const pending = fetchToken(id, account)
    .then((tokenId) => {
      rememberOwnedCollectionHold(account, id, tokenId);
      return tokenId;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, pending);
}
