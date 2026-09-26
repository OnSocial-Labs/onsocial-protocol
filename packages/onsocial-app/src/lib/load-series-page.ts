import { cache } from 'react';
import {
  fetchCollectionsByCreatorPage,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  fetchSeriesBrandingServer,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import { seriesDisplayTitle } from '@/features/scarces/series-page-view';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { loadProfileShell, type AppProfileShell } from '@/lib/profile-shell';

const SERIES_CREATOR_PAGE = 48;

async function fetchSeriesPageCollections(creator: string): Promise<{
  views: CollectionView[];
  hasMore: boolean;
}> {
  try {
    const page = await fetchCollectionsByCreatorPage(creator, {
      limit: SERIES_CREATOR_PAGE,
      client: createServerOnSocialClient(),
    });
    return {
      views: page.views,
      hasMore: page.fetched >= SERIES_CREATOR_PAGE,
    };
  } catch {
    const page = await fetchCollectionsByCreatorPage(creator, {
      limit: SERIES_CREATOR_PAGE,
    });
    return {
      views: page.views,
      hasMore: page.fetched >= SERIES_CREATOR_PAGE,
    };
  }
}

export type SeriesPageData = {
  creatorId: string;
  seriesId: string;
  branding: SeriesBranding | null;
  drops: CollectionView[];
  /** The creator catalog continues past the first page. */
  creatorHasMore: boolean;
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
        creatorHasMore: false,
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
      drops: collections.views.filter((view) => view.seriesId === id),
      creatorHasMore: collections.hasMore,
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
