import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import {
  isBlockEitherWay,
  isViewerMuting,
} from '@/lib/viewer-mute-block-filter';

export type MessagesSearchBlockReason = 'block' | 'muted';

export function normalizeMessagesSearchQuery(raw: string): string {
  return normalizeProfileSearchQuery(raw);
}

export function isMessagesPeopleSearchActive(query: string): boolean {
  return isProfileSearchQuery(query);
}

export function threadMatchesQuery(opts: {
  peerAccountId: string;
  query: string;
  displayName?: string | null;
  preview?: string | null;
}): boolean {
  const q = normalizeMessagesSearchQuery(opts.query).toLowerCase();
  if (!q) return true;
  const account = opts.peerAccountId.trim().toLowerCase();
  const handle = fallbackLabel(opts.peerAccountId).toLowerCase();
  const name = displayName(
    opts.peerAccountId,
    opts.displayName ?? undefined
  ).toLowerCase();
  const preview = (opts.preview ?? '').trim().toLowerCase();
  return (
    name.includes(q) ||
    handle.includes(q) ||
    account.includes(q) ||
    preview.includes(q)
  );
}

export function filterInboxThreadsByQuery<
  T extends { threadId: string; peerAccountId: string },
>(opts: {
  threads: readonly T[];
  query: string;
  names?: Record<string, string | undefined>;
  previews?: Record<string, string | undefined>;
}): T[] {
  const q = normalizeMessagesSearchQuery(opts.query);
  if (!q) return [...opts.threads];
  return opts.threads.filter((thread) =>
    threadMatchesQuery({
      peerAccountId: thread.peerAccountId,
      query: q,
      displayName: opts.names?.[thread.peerAccountId],
      preview: opts.previews?.[thread.threadId],
    })
  );
}

export function excludePeersInInbox<T extends { accountId: string }>(
  profiles: readonly T[],
  peerAccountIds: Iterable<string>,
  viewerAccountId?: string | null
): T[] {
  const hidden = new Set(
    [...peerAccountIds].map((id) => id.trim().toLowerCase()).filter(Boolean)
  );
  const viewer = viewerAccountId?.trim().toLowerCase();
  if (viewer) hidden.add(viewer);
  return profiles.filter(
    (profile) => !hidden.has(profile.accountId.trim().toLowerCase())
  );
}

/** Same sort rule as the gateway mailbox (`a::b` lowercase, lexicographic). */
export function buildDmThreadId(a: string, b: string): string {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

export function messagingBlockedReason(
  accountId: string
): MessagesSearchBlockReason | null {
  if (isBlockEitherWay(accountId)) return 'block';
  if (isViewerMuting(accountId)) return 'muted';
  return null;
}

export function messagingBlockedCopy(
  reason: MessagesSearchBlockReason | null
): string | null {
  if (reason === 'block') return 'Messaging unavailable';
  if (reason === 'muted') return 'Unmute to message';
  return null;
}
