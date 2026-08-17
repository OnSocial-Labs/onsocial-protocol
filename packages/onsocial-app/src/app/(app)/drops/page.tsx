import { Suspense } from 'react';
import type { Metadata } from 'next';
import { DropsLoadingScreen } from '@/features/drops/drops-loading-screen';
import { DropsPagePanel } from '@/features/drops/drops-page-panel';
import {
  DROPS_PAGE_SIZE,
  fetchCreatorLeaders,
  fetchDropsPage,
  type DropsSort,
} from '@/features/drops/drops-data';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  DROPS_SORT_PARAM,
  MARKET_KIND_PARAM,
  parseDropsMediumParam,
  parseDropsSortParam,
  type DropsMediumParam,
} from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'Drops • OnSocial',
  description: 'Discover live, upcoming, and loved drops on OnSocial.',
};

type DropsPageProps = {
  searchParams?: Promise<{
    [DROPS_SORT_PARAM]?: string | string[];
    [MARKET_KIND_PARAM]?: string | string[];
  }>;
};

function firstParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Saved needs a viewer wallet — skip SSR seed and let the client reload.
 * Other sorts deep-link from `?sort=` so first paint matches the URL tab.
 */
function resolveSsrSort(raw: string | null | undefined): DropsSort {
  const sort = parseDropsSortParam(raw);
  return sort === 'saved' ? 'live' : sort;
}

export default async function DropsPage({ searchParams }: DropsPageProps) {
  const resolved = (await searchParams) ?? {};
  const sortParam = firstParam(resolved[DROPS_SORT_PARAM]);
  const kindParam = firstParam(resolved[MARKET_KIND_PARAM]);
  const urlSort = parseDropsSortParam(sortParam);
  const ssrSort = resolveSsrSort(sortParam);
  const medium: DropsMediumParam = parseDropsMediumParam(kindParam);

  const client = createServerOnSocialClient();
  // Server request clock for relative-time hydration (must match SSR markup).
  // eslint-disable-next-line react-hooks/purity -- Server Component; not a client render
  const initialNowMs = Date.now();

  const page =
    urlSort === 'saved'
      ? { items: [], hasMore: false }
      : await fetchDropsPage({
          sort: ssrSort,
          limit: DROPS_PAGE_SIZE,
          mediumKind: medium === 'all' ? null : medium,
          client,
        }).catch(() => null);

  const creators =
    urlSort !== 'saved' && ssrSort === 'new'
      ? await fetchCreatorLeaders({ limit: 8, client }).catch(() => [])
      : [];

  return (
    <Suspense fallback={<DropsLoadingScreen />}>
      <DropsPagePanel
        initialSort={urlSort === 'saved' ? 'saved' : ssrSort}
        initialMedium={medium}
        initialItems={page?.items ?? []}
        initialHasMore={page?.hasMore ?? false}
        initialFetchFailed={page === null}
        initialCreators={creators}
        initialNowMs={initialNowMs}
      />
    </Suspense>
  );
}
