import type { DmThreadSummary } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';

/** In-tab memory only — hard refresh starts cold. */
export const MESSAGES_INBOX_SESSION_TTL_MS = 30 * 60 * 1000;

export type MessagesInboxSessionSnapshot = {
  accountId: string;
  threads: DmThreadSummary[];
  inboxPreviewByThread: Record<string, string>;
  scrollTop: number;
  savedAt: number;
};

let snapshot: MessagesInboxSessionSnapshot | null = null;

export function clearMessagesInboxSession(): void {
  snapshot = null;
}

function copyThreads(threads: readonly DmThreadSummary[]): DmThreadSummary[] {
  return threads.map((thread) => ({ ...thread }));
}

function copyPreviews(
  previews: Record<string, string>
): Record<string, string> {
  return { ...previews };
}

export function writeMessagesInboxSession(input: {
  accountId: string | null;
  threads: readonly DmThreadSummary[] | null;
  inboxPreviewByThread: Record<string, string>;
  scrollTop: number;
  now?: number;
}): void {
  const accountId = input.accountId?.trim();
  if (!accountId || input.threads == null) return;
  snapshot = {
    accountId,
    threads: copyThreads(input.threads),
    inboxPreviewByThread: copyPreviews(input.inboxPreviewByThread),
    scrollTop: Math.max(0, input.scrollTop),
    savedAt: input.now ?? Date.now(),
  };
}

export function peekMessagesInboxSession(
  now: number = Date.now()
): MessagesInboxSessionSnapshot | null {
  if (!snapshot) return null;
  if (now - snapshot.savedAt > MESSAGES_INBOX_SESSION_TTL_MS) {
    snapshot = null;
    return null;
  }
  return {
    ...snapshot,
    threads: copyThreads(snapshot.threads),
    inboxPreviewByThread: copyPreviews(snapshot.inboxPreviewByThread),
  };
}

export function readMessagesInboxSession(
  accountId: string | null,
  now: number = Date.now()
): MessagesInboxSessionSnapshot | null {
  if (!accountId?.trim()) return null;
  const peeked = peekMessagesInboxSession(now);
  if (!peeked || !accountIdsEqual(peeked.accountId, accountId)) return null;
  return peeked;
}
