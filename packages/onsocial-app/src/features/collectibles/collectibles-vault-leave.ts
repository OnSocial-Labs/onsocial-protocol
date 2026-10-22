import { accountIdsEqual } from '@/lib/account-match';
import { portfolioAccountFromHref } from '@/lib/os-face-leave';
import { portfolioPath } from '@/lib/overlay-routes';

/** Collectibles drawer on this face. The vault leaves here. */
export function portfolioCollectionDrawerPath(accountId: string): string {
  return `${portfolioPath(accountId)}?tab=collection`;
}

/**
 * Pop only when this vault was opened from the same face.
 * Another face (launcher Collectibles while visiting) keeps its own parent.
 */
export function portfolioVaultBackPops(
  vaultAccountId: string | null | undefined,
  previousHref: string | null | undefined
): boolean {
  const account = vaultAccountId?.trim() || '';
  const previous = portfolioAccountFromHref(previousHref);
  if (!account || !previous) return false;
  return accountIdsEqual(previous, account);
}
