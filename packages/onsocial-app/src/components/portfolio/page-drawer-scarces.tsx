'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { PageDrawerStoreList } from '@/components/portfolio/page-drawer-store';
import { PageDrawerWorksCatalog } from '@/components/portfolio/page-drawer-works-catalog';
import { SCARCES_VIEW_PARAM } from '@/components/portfolio/profile-feed-tabs';
import type { ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import type { ProfileStoreShelf as ProfileStoreShelfData } from '@/lib/profile-store-types';

export type ScarcesSegment = 'available' | 'works';

const SCARCES_SEGMENT_ITEMS = [
  { id: 'available' as const, label: 'Available' },
  { id: 'works' as const, label: 'All works' },
];

function isScarcesSegment(value: string | null): value is ScarcesSegment {
  return value === 'available' || value === 'works';
}

/** Legacy `?tab=drops` and explicit `scarcesView` deep links. */
export function resolveScarcesSegmentFromSearch(
  search: string
): ScarcesSegment {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const view = params.get(SCARCES_VIEW_PARAM);
  if (view === 'works' || tab === 'drops') return 'works';
  return 'available';
}

export function useScarcesSegmentParam(): [
  ScarcesSegment,
  (segment: ScarcesSegment) => void,
] {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get(SCARCES_VIEW_PARAM);
  const tab = searchParams.get('tab');
  const [segment, setSegment] = useState<ScarcesSegment>(() => {
    if (fromUrl === 'works' || tab === 'drops') return 'works';
    if (isScarcesSegment(fromUrl)) return fromUrl;
    return 'available';
  });

  const selectSegment = useCallback((next: ScarcesSegment) => {
    setSegment(next);
    const params = new URLSearchParams(window.location.search);
    if (next === 'available') params.delete(SCARCES_VIEW_PARAM);
    else params.set(SCARCES_VIEW_PARAM, next);
    const qs = params.toString();
    const hash = window.location.hash;
    const base = window.location.pathname;
    window.history.replaceState(
      null,
      '',
      qs ? `${base}?${qs}${hash}` : `${base}${hash}`
    );
  }, []);

  return [segment, selectSegment];
}

export function PageDrawerScarcesPanel({
  pageAccountId,
  profileName,
  avatarUrl,
  storeShelf,
  createdPeeks,
}: {
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  storeShelf: ProfileStoreShelfData;
  createdPeeks: ProfileCreatedPeek[];
}) {
  const [segment, setSegment] = useScarcesSegmentParam();

  return (
    <div className="page-drawer-scarces">
      <OsChipRail
        ariaLabel="Scarces view"
        className="page-drawer-scarces-segments"
        value={segment}
        onValueChange={setSegment}
        tabIdFor={(option) => `page-drawer-scarces-${option}`}
        items={SCARCES_SEGMENT_ITEMS.map(({ id, label }) => ({
          id,
          label,
        }))}
      />

      {segment === 'available' ? (
        <PageDrawerStoreList
          pageAccountId={pageAccountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
          shelf={storeShelf}
        />
      ) : (
        <PageDrawerWorksCatalog
          pageAccountId={pageAccountId}
          profileName={profileName}
          avatarUrl={avatarUrl}
          createdPeeks={createdPeeks}
        />
      )}
    </div>
  );
}
