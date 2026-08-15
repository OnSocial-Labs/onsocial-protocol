import { cache } from 'react';
import {
  fetchCollectionsByCreator,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  fetchSeriesBrandingServer,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import {
  loadProfileShell,
  type AppProfileShell,
} from '@/lib/profile-shell';

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
      fetchCollectionsByCreator(creator, { limit: 48 }),
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
  const fallbackTitle = drops.find((drop) => drop.seriesTitle)?.seriesTitle;
  return branding?.title ?? fallbackTitle ?? seriesId;
}
