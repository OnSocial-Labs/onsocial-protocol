import { cache } from 'react';
import {
  fetchAppIndexerRow,
  fetchAppStats,
  type AppStatsView,
  type AppView,
} from '@/features/scarces/apps-data';
import {
  fetchCollectionsByApp,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

export type AppPageData = {
  app: AppView | null;
  stats: AppStatsView | null;
  drops: CollectionView[];
};

/** Indexer-first hub shell + parallel stats/drops for SSR. */
export const loadAppPageData = cache(async (appId: string): Promise<AppPageData> => {
  const id = appId.trim();
  if (!id) return { app: null, stats: null, drops: [] };
  try {
    const client = createServerOnSocialClient();
    const [app, stats, drops] = await Promise.all([
      fetchAppIndexerRow(id, client),
      fetchAppStats(id, client),
      fetchCollectionsByApp(id, { limit: 48, client }),
    ]);
    return { app, stats, drops };
  } catch {
    return { app: null, stats: null, drops: [] };
  }
});
