import {
  collectionCurrentRowToView,
  fetchCollectionsByCreatorPage,
} from '@/features/scarces/collections-data';
import {
  heldCollectionId,
  loadHeldCollectionIds,
  loadPinnedSongChoices,
  mergePinnedSongChoices,
  pinnedSongChoicesFromViews,
  type PinnedSongCatalogView,
  type PinnedSongChoice,
} from '@/lib/pinned-song-choices';

const HELD_PAGE_SIZE = 100;
const HELD_MAX_TOKENS = 2000;
const VIEW_BATCH = 80;

async function readOnlyClient() {
  const { createReadOnlyOnSocialClient } = await import(
    '@/lib/create-readonly-onsocial-client'
  );
  return createReadOnlyOnSocialClient();
}

/** True when this account still holds an unburned copy of the drop. */
export async function accountHoldsCollection(
  accountId: string,
  collectionId: string
): Promise<boolean> {
  const owner = accountId.trim();
  const id = collectionId.trim();
  if (!owner || !id) return false;
  const client = await readOnlyClient();
  const page = await client.query.scarces.ownedBy(owner, {
    collectionId: id,
    limit: 1,
  });
  return page.items.length > 0;
}

export async function pinnedCatalogViewsForIds(
  ids: readonly string[]
): Promise<PinnedSongCatalogView[]> {
  if (ids.length === 0) return [];
  const client = await readOnlyClient();
  return viewsForIds(client, ids);
}

async function viewsForIds(
  client: Awaited<ReturnType<typeof readOnlyClient>>,
  ids: readonly string[]
): Promise<PinnedSongCatalogView[]> {
  const views: PinnedSongCatalogView[] = [];
  for (let index = 0; index < ids.length; index += VIEW_BATCH) {
    const batch = ids.slice(index, index + VIEW_BATCH);
    let rows: Awaited<
      ReturnType<typeof client.query.scarces.collectionsCurrentByIds>
    > = [];
    try {
      rows = await client.query.scarces.collectionsCurrentByIds(batch);
    } catch {
      continue;
    }
    const byId = new Map(
      rows.flatMap((row) => {
        const id = row.collectionId?.trim();
        return id ? [[id, row] as const] : [];
      })
    );
    for (const id of batch) {
      const row = byId.get(id);
      if (!row) continue;
      const view = collectionCurrentRowToView(row);
      if (!view) continue;
      views.push({
        collectionId: view.collectionId,
        title: view.title,
        kind: view.kind,
        playables: view.playables,
        creatorId: view.creatorId,
        writingFormat: view.writingFormat,
        readables: view.readables,
        writingManifestCid: view.writingManifestCid,
        bookPdf: view.bookPdf,
      });
    }
  }
  return views;
}

/** Albums this account published, then audio it holds. */
export async function loadPortfolioSongChoices(
  accountId: string
): Promise<PinnedSongChoice[]> {
  const account = accountId.trim();
  if (!account) return [];
  const client = await readOnlyClient();

  const [released, heldIds] = await Promise.all([
    loadPinnedSongChoices((offset, limit) =>
      fetchCollectionsByCreatorPage(account, { offset, limit })
    ).catch(() => [] as PinnedSongChoice[]),
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
  const held = pinnedSongChoicesFromViews(
    await viewsForIds(
      client,
      heldIds.filter((id) => !releasedIds.has(id))
    ),
    'collected'
  );
  return mergePinnedSongChoices(released, held);
}
