import { accountIdsEqual } from '@/lib/account-match';

/**
 * The profile mark only starts the pin.
 * Once that release is the dock's song, pause lives on the dock and the mark hides.
 */
export function portfolioSongMarkVisible(opts: {
  pinnedId: string;
  sessionId: string | null;
}): boolean {
  return opts.sessionId !== opts.pinnedId;
}

/**
 * A published release stays on the page after it sells out.
 * A collected album stays only while this account still holds a copy.
 */
export function portfolioSongPinEligible(opts: {
  pageAccountId: string;
  creatorId: string;
  holdsCopy: boolean;
}): boolean {
  const pageAccountId = opts.pageAccountId.trim();
  const creatorId = opts.creatorId.trim();
  if (!pageAccountId || !creatorId) return false;
  if (accountIdsEqual(pageAccountId, creatorId)) return true;
  return opts.holdsCopy;
}
