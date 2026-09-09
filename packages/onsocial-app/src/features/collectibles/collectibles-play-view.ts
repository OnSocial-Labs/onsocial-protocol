import { APP_COLLECTIBLES_PATH } from '@/lib/app-routes';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';

/** Play leave — vault when signed in, OS Collectibles hop when not. */
export function collectiblesPlayBackHref(
  viewerAccountId?: string | null
): string {
  const account = viewerAccountId?.trim();
  return account ? portfolioCollectiblesPath(account) : APP_COLLECTIBLES_PATH;
}
