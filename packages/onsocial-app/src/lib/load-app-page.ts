import { cache } from 'react';
import {
  fetchAppIndexerRow,
  fetchAppStats,
  type AppStatsView,
  type AppView,
} from '@/features/scarces/apps-data';
import {
  fetchCollectionsByAppPage,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type AppPageData = {
  app: AppView | null;
  stats: AppStatsView | null;
  drops: CollectionView[];
  /** Raw indexer rows behind `drops`. Filtered rows still advance the cursor. */
  dropsFetched: number;
};

/** Indexer-first hub shell + parallel stats/drops for SSR. */
export const loadAppPageData = cache(
  async (appId: string): Promise<AppPageData> => {
    const id = appId.trim();
    if (!id) return { app: null, stats: null, drops: [], dropsFetched: 0 };
    try {
      const client = createServerOnSocialClient();
      const [app, stats, page] = await Promise.all([
        fetchAppIndexerRow(id, client),
        fetchAppStats(id, client),
        fetchCollectionsByAppPage(id, { limit: 48, client }),
      ]);
      return { app, stats, drops: page.views, dropsFetched: page.fetched };
    } catch {
      return { app: null, stats: null, drops: [], dropsFetched: 0 };
    }
  }
);
