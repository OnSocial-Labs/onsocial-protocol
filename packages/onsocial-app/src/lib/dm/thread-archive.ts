/**
 * Local archive of conversations sealed to a prior messaging identity.
 * Used after key reset so the inbox does not stay cluttered with
 * permanently undecryptable rows. Does not delete mailbox ciphertext.
 */

const STORE_PREFIX = 'onsocial.app.dm.archive.';

export type DmThreadArchiveStore = {
  /** When messaging keys were last reset / rotated on this device. */
  keysResetAt?: string;
  /** Thread ids hidden from the main inbox until a decrypt succeeds again. */
  sealedThreadIds: string[];
};

function storageKey(accountId: string): string {
  return `${STORE_PREFIX}${accountId.trim().toLowerCase()}`;
}

function readStore(accountId: string): DmThreadArchiveStore {
  if (typeof window === 'undefined') {
    return { sealedThreadIds: [] };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(accountId));
    if (!raw) return { sealedThreadIds: [] };
    const parsed = JSON.parse(raw) as Partial<DmThreadArchiveStore>;
    return {
      keysResetAt:
        typeof parsed.keysResetAt === 'string' ? parsed.keysResetAt : undefined,
      sealedThreadIds: Array.isArray(parsed.sealedThreadIds)
        ? parsed.sealedThreadIds.filter(
            (id): id is string => typeof id === 'string' && Boolean(id.trim())
          )
        : [],
    };
  } catch {
    return { sealedThreadIds: [] };
  }
}

function writeStore(accountId: string, store: DmThreadArchiveStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    storageKey(accountId.trim().toLowerCase()),
    JSON.stringify(store)
  );
}

/** Record that messaging keys were reset on this device. */
export function recordDmKeysReset(
  accountId: string,
  at: string = new Date().toISOString()
): void {
  const id = accountId.trim().toLowerCase();
  const existing = readStore(id);
  writeStore(id, {
    ...existing,
    keysResetAt: at,
  });
}

export function getDmKeysResetAt(accountId: string): string | null {
  return readStore(accountId).keysResetAt ?? null;
}

export function isDmThreadSealedArchived(
  accountId: string,
  threadId: string
): boolean {
  const id = threadId.trim();
  if (!id) return false;
  return readStore(accountId).sealedThreadIds.includes(id);
}

export function listSealedArchivedThreadIds(accountId: string): string[] {
  return [...readStore(accountId).sealedThreadIds];
}

/** Hide threads that can no longer open after a key reset. */
export function archiveSealedDmThreads(
  accountId: string,
  threadIds: string[]
): void {
  const id = accountId.trim().toLowerCase();
  const existing = readStore(id);
  const next = new Set(existing.sealedThreadIds);
  for (const threadId of threadIds) {
    const trimmed = threadId.trim();
    if (trimmed) next.add(trimmed);
  }
  writeStore(id, {
    ...existing,
    sealedThreadIds: [...next],
  });
}

export function archiveSealedDmThread(
  accountId: string,
  threadId: string
): void {
  archiveSealedDmThreads(accountId, [threadId]);
}

/** A decryptable message means the conversation is live again — show it. */
export function unarchiveDmThread(accountId: string, threadId: string): void {
  const id = accountId.trim().toLowerCase();
  const trimmed = threadId.trim();
  if (!trimmed) return;
  const existing = readStore(id);
  if (!existing.sealedThreadIds.includes(trimmed)) return;
  writeStore(id, {
    ...existing,
    sealedThreadIds: existing.sealedThreadIds.filter((item) => item !== trimmed),
  });
}

/**
 * After decrypt: archive when every loaded message fails and a reset happened;
 * unarchive when any message opens.
 */
export function reconcileDmThreadArchiveAfterDecrypt(opts: {
  accountId: string;
  threadId: string;
  messageIds: string[];
  plainById: Record<string, string>;
  isDecryptFailure: (text: string | undefined) => boolean;
}): 'archived' | 'unarchived' | 'unchanged' {
  const { accountId, threadId, messageIds, plainById, isDecryptFailure } = opts;
  if (messageIds.length === 0) return 'unchanged';

  const anyReadable = messageIds.some(
    (id) => !isDecryptFailure(plainById[id])
  );
  if (anyReadable) {
    if (isDmThreadSealedArchived(accountId, threadId)) {
      unarchiveDmThread(accountId, threadId);
      return 'unarchived';
    }
    return 'unchanged';
  }

  if (!getDmKeysResetAt(accountId)) return 'unchanged';
  if (isDmThreadSealedArchived(accountId, threadId)) return 'unchanged';
  archiveSealedDmThread(accountId, threadId);
  return 'archived';
}
