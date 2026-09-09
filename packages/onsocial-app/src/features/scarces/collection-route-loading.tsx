'use client';

import { useParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { CollectionPageSkeleton } from '@/features/scarces/collection-page-skeleton';
import { collectionChildLeaveHref } from '@/features/scarces/collection-page-view';
import { APP_DROPS_PATH } from '@/lib/app-routes';

function collectionIdFromParams(params: { collectionId?: string | string[] }) {
  const raw = params.collectionId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' ? id : '';
}

/** Route `loading.tsx` — visitor leave is Drops until the panel knows the holder. */
export function CollectionPageLoadingScreen() {
  return (
    <OsAppScreen
      title="Drop"
      dockBack
      backFallbackHref={APP_DROPS_PATH}
      immersiveHeader
    >
      <div aria-hidden className="os-chrome-glass" />
      <CollectionPageSkeleton />
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
      <div className="market-page ticket-door-page">
        <div className="market-page-empty">
          <p className="market-page-empty-copy">{copy}</p>
        </div>
      </div>
    </OsAppScreen>
  );
}
