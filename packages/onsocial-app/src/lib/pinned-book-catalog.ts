import { fetchCollectionsByCreatorPage } from '@/features/scarces/collections-data';
import {
  loadPinnedBookChoices,
  mergePinnedBookChoices,
  pinnedBookChoicesFromViews,
  type PinnedBookChoice,
} from '@/lib/pinned-book-choices';
import {
  heldCollectionId,
  loadHeldCollectionIds,
} from '@/lib/pinned-song-choices';
import { pinnedCatalogViewsForIds } from '@/lib/pinned-song-catalog';

const HELD_PAGE_SIZE = 100;
const HELD_MAX_TOKENS = 2000;

async function readOnlyClient() {
  const { createReadOnlyOnSocialClient } = await import(
    '@/lib/create-readonly-onsocial-client'
  );
  return createReadOnlyOnSocialClient();
}

/** Books and issues this account published, then ones it holds. */
export async function loadPortfolioBookChoices(
  accountId: string
): Promise<PinnedBookChoice[]> {
  const account = accountId.trim();
  if (!account) return [];
  const client = await readOnlyClient();

  const [released, heldIds] = await Promise.all([
    loadPinnedBookChoices((offset, limit) =>
      fetchCollectionsByCreatorPage(account, { offset, limit })
    ).catch(() => [] as PinnedBookChoice[]),
    loadHeldCollectionIds(
      async (offset, limit) => {
        const page = await client.query.scarces.ownedBy(account, {
          offset,
          limit,
        });
        return {
          ids: page.items.map((row) => heldCollectionId(row)),
          fetched: page.items.length,
        };
      },
      { pageSize: HELD_PAGE_SIZE, max: HELD_MAX_TOKENS }
    ).catch(() => [] as string[]),
  ]);

  const releasedIds = new Set(released.map((choice) => choice.id));
  const held = pinnedBookChoicesFromViews(
    await pinnedCatalogViewsForIds(
      heldIds.filter((id) => !releasedIds.has(id))
    ),
    'collected'
  );
  return mergePinnedBookChoices(released, held);
}
