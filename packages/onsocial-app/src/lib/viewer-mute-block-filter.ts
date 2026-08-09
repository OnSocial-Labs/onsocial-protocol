import {
  deriveMutedAccountIds,
  resolveViewerMute,
} from '@/lib/viewer-mute-ledger';
import {
  getGlobalApiMutedIds,
  getGlobalViewerMuteLedger,
} from '@/lib/viewer-mute-global';
import {
  deriveBlockedAccountIds,
  resolveViewerBlock,
} from '@/lib/viewer-block-ledger';
import {
  getGlobalApiIncomingBlockIds,
  getGlobalApiOutgoingBlockIds,
  getGlobalViewerBlockLedger,
} from '@/lib/viewer-block-global';
import { accountIdsEqual } from '@/lib/account-match';

/** Accounts the viewer should not see in feeds / discover. */
export function getViewerHiddenAccountIdSet(): Set<string> {
  const muted = deriveMutedAccountIds(
    getGlobalApiMutedIds(),
    getGlobalViewerMuteLedger()
  );
  const blocked = deriveBlockedAccountIds(
    getGlobalApiOutgoingBlockIds(),
    getGlobalViewerBlockLedger()
  );
  const incoming = getGlobalApiIncomingBlockIds();
  const set = new Set<string>();
  for (const id of muted) set.add(id.toLowerCase());
  for (const id of blocked) set.add(id.toLowerCase());
  for (const id of incoming) set.add(id.toLowerCase());
  return set;
}

export function isAccountHiddenForViewer(accountId: string): boolean {
  return getViewerHiddenAccountIdSet().has(accountId.toLowerCase());
}

export function isViewerMuting(accountId: string): boolean {
  return resolveViewerMute(
    getGlobalViewerMuteLedger(),
    accountId,
    getGlobalApiMutedIds().some((id) => accountIdsEqual(id, accountId))
  );
}

export function isViewerBlocking(accountId: string): boolean {
  return resolveViewerBlock(
    getGlobalViewerBlockLedger(),
    accountId,
    getGlobalApiOutgoingBlockIds().some((id) => accountIdsEqual(id, accountId))
  );
}

/** True when either side has a live block (blocks stands either way). */
export function isBlockEitherWay(accountId: string): boolean {
  if (isViewerBlocking(accountId)) return true;
  return getGlobalApiIncomingBlockIds().some((id) =>
    accountIdsEqual(id, accountId)
  );
}

export function filterHiddenAuthors<T extends { accountId?: string | null }>(
  rows: readonly T[]
): T[] {
  const hidden = getViewerHiddenAccountIdSet();
  if (hidden.size === 0) return rows as T[];
  return rows.filter((row) => {
    const id = row.accountId?.trim();
    if (!id) return true;
    return !hidden.has(id.toLowerCase());
  });
}
