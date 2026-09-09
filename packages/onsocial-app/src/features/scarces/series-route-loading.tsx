'use client';

import { useParams } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { SeriesPageSkeleton } from '@/features/scarces/series-page-skeleton';
import { seriesRouteLoadingBackHref } from '@/features/scarces/series-page-view';

function creatorIdFromParams(params: { creatorId?: string | string[] }) {
  const raw = params.creatorId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== 'string' || !id.trim()) return '';
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/** Route `loading.tsx` — visitor shop when the creator segment is known. */
export function SeriesRouteLoadingScreen() {
  const params = useParams<{ creatorId?: string }>();
  const backHref = seriesRouteLoadingBackHref(creatorIdFromParams(params));

  return (
    <OsAppScreen
      title="Series"
      dockBack
      backFallbackHref={backHref}
      glassChrome
    >
      <div className="market-page">
        <SeriesPageSkeleton />
      </div>
    </OsAppScreen>
  );
}
