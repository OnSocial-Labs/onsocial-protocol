import { cache } from 'react';
import {
  fetchCollectionsByCreator,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  fetchSeriesBrandingServer,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import { seriesDisplayTitle } from '@/features/scarces/series-page-view';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { loadProfileShell, type AppProfileShell } from '@/lib/profile-shell';

async function fetchSeriesPageCollections(
  creator: string
): Promise<CollectionView[]> {
  try {
    return await fetchCollectionsByCreator(creator, {
      limit: 48,
      client: createServerOnSocialClient(),
    });
  } catch {
    return fetchCollectionsByCreator(creator, { limit: 48 });
  }
}

export type SeriesPageData = {
  creatorId: string;
  seriesId: string;
  branding: SeriesBranding | null;
  drops: CollectionView[];
  profile: AppProfileShell | null;
};

/**
 * One request graph for series SSR + metadata — React `cache` dedupes
 * generateMetadata and the page render in the same pass.
 */
export const loadSeriesPageData = cache(
  async (creatorId: string, seriesId: string): Promise<SeriesPageData> => {
    const creator = creatorId.trim();
    const id = seriesId.trim();
    if (!creator || !id) {
      return {
        creatorId: creator,
        seriesId: id,
        branding: null,
        drops: [],
        profile: null,
      };
    }

    const [collections, profile, branding] = await Promise.all([
      fetchSeriesPageCollections(creator),
      loadProfileShell(creator),
      fetchSeriesBrandingServer(creator, id),
    ]);

    return {
      creatorId: creator,
      seriesId: id,
      branding,
      drops: collections.filter((view) => view.seriesId === id),
      profile,
    };
  }
);

export function seriesPageDocumentTitle(
  branding: SeriesBranding | null,
  drops: CollectionView[],
  seriesId: string
): string {
  return seriesDisplayTitle({
    brandingTitle: branding?.title,
    dropSeriesTitle: drops.find((drop) => drop.seriesTitle)?.seriesTitle,
    seriesId,
  });
}
