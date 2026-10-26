'use client';

import { HomePagePanel } from '@/features/home/home-feed';
import type { HomeFeedPaint } from '@/lib/load-home-feed-page';

/**
 * Cold home visit. A saved session still wins: HomePagePanel reads memory
 * before this seed, and sessionStorage replaces it before paint.
 */
export function HomeFeedRoute({ paint }: { paint: HomeFeedPaint | null }) {
  return (
    <HomePagePanel
      initialPage={paint?.page ?? null}
      initialEngagement={paint?.engagement ?? null}
      initialScarceEmbeds={paint?.scarceEmbeds ?? null}
    />
  );
}
