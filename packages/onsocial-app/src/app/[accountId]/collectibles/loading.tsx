import { headers } from 'next/headers';
import { CollectiblesLoadingScreen } from '@/features/collectibles/collectibles-loading-screen';
import {
  COLLECTIBLES_ACCOUNT_HEADER,
  COLLECTIBLES_HELD_KINDS_HEADER,
  COLLECTIBLES_SEARCH_HEADER,
  parseCollectiblesHeldKindsCookie,
} from '@/lib/collectibles-held-kinds';
import { parseCollectiblesPageQueryFromSearch } from '@/lib/load-collectibles-page';

/** First entry from another route. Kind / search replaces must not remount the panel. */
export default async function CollectiblesLoading() {
  const h = await headers();
  const search = h.get(COLLECTIBLES_SEARCH_HEADER);
  const account = h.get(COLLECTIBLES_ACCOUNT_HEADER)?.trim() || '';
  const query =
    search === null
      ? undefined
      : parseCollectiblesPageQueryFromSearch(search);
  const heldKinds = account
    ? parseCollectiblesHeldKindsCookie(
        h.get(COLLECTIBLES_HELD_KINDS_HEADER),
        account
      )
    : null;

  return (
    <CollectiblesLoadingScreen
      query={query}
      pageAccountId={account || undefined}
      heldKinds={heldKinds ?? undefined}
    />
  );
}
