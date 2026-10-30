import { APP_COLLECTIBLES_PATH } from '@/lib/app-routes';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';

/** Play leave — vault when signed in, OS Collectibles hop when not. */
export function collectiblesPlayBackHref(
  viewerAccountId?: string | null
): string {
  const account = viewerAccountId?.trim();
  return account ? portfolioCollectiblesPath(account) : APP_COLLECTIBLES_PATH;
}

/**
 * Transfer from the player.
 * Several known copies open the picker. A scan still in flight opens the
 * transfer sheet for the edition already on screen.
 */
export function playTransferOpen(
  ownedCopies: readonly unknown[] | null
): 'picker' | 'sheet' {
  return ownedCopies != null && ownedCopies.length > 1 ? 'picker' : 'sheet';
}
