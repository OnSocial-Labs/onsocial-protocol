'use client';

import { useLayoutEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectionPagePanel } from '@/features/scarces/collection-page-panel';
import { CollectionPageSkeleton } from '@/features/scarces/collection-page-skeleton';
import { readCollectionCreatorFace } from '@/features/scarces/collection-creator-face-cache';
import { readCollectionView } from '@/features/scarces/collection-view-cache';
import {
  collectionChildLeaveHref,
  editionTokenForCollection,
} from '@/features/scarces/collection-page-view';
import { useCatalogDockBack } from '@/hooks/use-catalog-dock-back';
import { APP_DROPS_PATH, COLLECTION_PASS_TOKEN_PARAM } from '@/lib/app-routes';
import { DOOR_PAGE_CLASS } from '@/lib/os-chrome-page';

function collectionIdFromParams(params: { collectionId?: string | string[] }) {
  const raw = params.collectionId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' ? decodeURIComponent(id) : '';
}

/**
 * Route `loading.tsx` — hot soft-nav paints the real drop panel with the
 * remembered seed (same layout as settled; activity fetches while RSC lands).
 * Cold leave is Drops until the panel knows the holder.
 */
export function CollectionPageLoadingScreen() {
  const params = useParams<{ collectionId?: string }>();
  const collectionId = collectionIdFromParams(params);
  const [editionToken, setEditionToken] = useState('');
  useLayoutEffect(() => {
    if (!collectionId) return;
    const query = new URLSearchParams(window.location.search);
    setEditionToken(
      editionTokenForCollection(
        collectionId,
        query.get(COLLECTION_PASS_TOKEN_PARAM)
      )
    );
  }, [collectionId]);
  const seed = collectionId ? readCollectionView(collectionId) : null;
  const creator = collectionId ? readCollectionCreatorFace(collectionId) : null;
  const onDockBack = useCatalogDockBack(APP_DROPS_PATH);

  if (seed && collectionId) {
    return (
      <CollectionPagePanel
        collectionId={collectionId}
        initial={seed}
        initialCreator={creator}
        initialEditionToken={editionToken || null}
      />
    );
  }

  return (
    <OsAppScreen
      title="Drop"
      dockBack
      onDockBack={onDockBack}
      backFallbackHref={APP_DROPS_PATH}
      immersiveHeader
    >
      <CollectionPageSkeleton hasEdition={Boolean(editionToken)} />
    </OsAppScreen>
  );
}

export function CollectionChildLoadingScreen({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  const params = useParams<{ collectionId?: string }>();
  const backHref = collectionChildLeaveHref(collectionIdFromParams(params));

  return (
    <OsAppScreen title={title} dockBack backFallbackHref={backHref} glassChrome>
      <div className={DOOR_PAGE_CLASS}>
        <div className="market-page-empty">
          <p className="market-page-empty-copy">{copy}</p>
        </div>
      </div>
    </OsAppScreen>
  );
}
