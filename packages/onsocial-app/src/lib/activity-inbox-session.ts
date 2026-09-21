import type { Notification } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';

/** In-tab memory only — hard refresh starts cold. */
export const ACTIVITY_INBOX_SESSION_TTL_MS = 30 * 60 * 1000;

export type ActivityInboxSessionSnapshot = {
  accountId: string;
  items: Notification[];
  nextCursor: string | null;
  scrollTop: number;
  savedAt: number;
};

let snapshot: ActivityInboxSessionSnapshot | null = null;

export function clearActivityInboxSession(): void {
  snapshot = null;
}

function copyItems(items: readonly Notification[]): Notification[] {
  return items.map((item) => ({ ...item }));
}

export function writeActivityInboxSession(input: {
  accountId: string | null;
  items: readonly Notification[] | null;
  nextCursor: string | null;
  scrollTop: number;
  now?: number;
}): void {
  const accountId = input.accountId?.trim();
  if (!accountId || input.items == null) return;
  snapshot = {
    accountId,
    items: copyItems(input.items),
    nextCursor: input.nextCursor,
    scrollTop: Math.max(0, input.scrollTop),
    savedAt: input.now ?? Date.now(),
  };
}

export function peekActivityInboxSession(
  now: number = Date.now()
): ActivityInboxSessionSnapshot | null {
  if (!snapshot) return null;
  if (now - snapshot.savedAt > ACTIVITY_INBOX_SESSION_TTL_MS) {
    snapshot = null;
    return null;
  }
  return {
    ...snapshot,
    items: copyItems(snapshot.items),
  };
}

export function readActivityInboxSession(
  accountId: string | null,
  now: number = Date.now()
): ActivityInboxSessionSnapshot | null {
  if (!accountId?.trim()) return null;
  const peeked = peekActivityInboxSession(now);
  if (!peeked || !accountIdsEqual(peeked.accountId, accountId)) return null;
  return peeked;
}
