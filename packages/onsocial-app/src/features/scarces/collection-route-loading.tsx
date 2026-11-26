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
 * Drop place has no `loading.tsx` — a tap paints the seeded drop, and that
 * same screen stays when the route arrives. A loading skeleton here remounted
 * Collectibles / Show pass. Cold miss stays in the panel.
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
