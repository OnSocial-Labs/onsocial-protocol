'use client';

import { useParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { collectionChildLeaveHref } from '@/features/scarces/collection-page-view';
import { DOOR_PAGE_CLASS } from '@/lib/os-chrome-page';

function collectionIdFromParams(params: { collectionId?: string | string[] }) {
  const raw = params.collectionId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' ? decodeURIComponent(id) : '';
}

/**
 * Door / redeem route loading only.
 * Drop place soft-nav has no `loading.tsx` — previous screen stays until the
 * page mounts once (avoids loading→page remount flicker on Collectibles /
 * Show pass). Cold miss skeleton lives in the panel.
 */
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
