import { cache } from 'react';
import { mapCollectionActivityRows } from '@/features/scarces/collection-activity-map';
import type { CollectionActivityRow } from '@/features/scarces/collection-activity-rows';
import {
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import {
  collectionCurrentRowToView,
  fetchCollection,
  hydrateWritingManifest,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';

/**
 * Indexer-first collection shell (deduped per request). Falls back to RPC when
 * the catalog row is missing or too thin for first paint.
 */
export const fetchCollectionCached = cache(
  async (collectionId: string): Promise<CollectionView | null> => {
    const id = collectionId.trim();
    if (!id) return null;
    try {
      const os = createServerOnSocialClient();
      const row = await os.query.scarces.collectionCurrent(id);
      if (row) {
        const view = collectionCurrentRowToView(row);
        if (view) return hydrateWritingManifest(view);
      }
    } catch {
      // Fall through to RPC.
    }
    return fetchCollection(id);
  }
);

/** Indexer creator face — React-cached per account for the request. */
export const loadCollectionCreatorFace = cache(
  async (accountId: string): Promise<CollectionCreatorFace> => {
    const id = accountId.trim();
    if (!id) return { avatarUrl: null, displayName: null };
    try {
      const os = createServerOnSocialClient();
      return await fetchCollectionCreatorFace(os, id);
    } catch {
      return { avatarUrl: null, displayName: null };
    }
  }
);

/** Indexer activity preview for drop page SSR. */
export const loadCollectionActivityPreview = cache(
  async (collectionId: string): Promise<CollectionActivityRow[]> => {
    const id = collectionId.trim();
    if (!id) return [];
    try {
      const os = createServerOnSocialClient();
      const rows = await os.query.scarces.collection(id, { limit: 48 });
      return mapCollectionActivityRows(rows);
    } catch {
      return [];
    }
  }
);

export type CollectionPageData = {
  view: CollectionView | null;
  creator: CollectionCreatorFace | null;
  activity: CollectionActivityRow[];
};

/**
 * Standing-class drop shell: indexer collection + parallel creator/activity.
 * Live mint counters reconcile via soft RPC refresh on the client.
 */
export const loadCollectionPageData = cache(
  async (collectionId: string): Promise<CollectionPageData> => {
    const id = collectionId.trim();
    if (!id) {
      return { view: null, creator: null, activity: [] };
    }
    const view = await fetchCollectionCached(id);
    if (!view) {
      return { view: null, creator: null, activity: [] };
    }
    const [creator, activity] = await Promise.all([
      loadCollectionCreatorFace(view.creatorId),
      loadCollectionActivityPreview(id),
    ]);
    return { view, creator, activity };
  }
);

/** Player SSR — collection + creator only (no activity band). */
export const loadCollectiblesPlayData = cache(
  async (
    collectionId: string
  ): Promise<{
    view: CollectionView | null;
    creator: CollectionCreatorFace | null;
  }> => {
    const id = collectionId.trim();
    if (!id) return { view: null, creator: null };
    const view = await fetchCollectionCached(id);
    if (!view) return { view: null, creator: null };
    const creator = await loadCollectionCreatorFace(view.creatorId);
    return { view, creator };
  }
);
