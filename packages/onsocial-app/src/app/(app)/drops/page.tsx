import type { Metadata } from 'next';
import { DropsPagePanel } from '@/features/drops/drops-page-panel';
import {
  loadDropsPageData,
  parseDropsPageQuery,
} from '@/lib/load-drops-page';
import {
  DROPS_SORT_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  MARKET_KIND_PARAM,
} from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'Drops • OnSocial',
  description: 'Discover live, upcoming, and loved drops on OnSocial.',
};

type DropsPageProps = {
  searchParams?: Promise<{
    [DROPS_SORT_PARAM]?: string | string[];
    [MARKET_KIND_PARAM]?: string | string[];
    [MARKET_AUDIO_FORMAT_PARAM]?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function DropsPage({ searchParams }: DropsPageProps) {
  const resolved = (await searchParams) ?? {};
  const query = parseDropsPageQuery({
    sort: firstParam(resolved[DROPS_SORT_PARAM]),
    kind: firstParam(resolved[MARKET_KIND_PARAM]),
    audioFormat: firstParam(resolved[MARKET_AUDIO_FORMAT_PARAM]),
  });
  // Do not await the catalog here — that remounts the shell via loading.tsx
  // on every sort / medium replace. The panel consumes the promise in the list slot.
  const seedPromise = loadDropsPageData(query);
  // eslint-disable-next-line react-hooks/purity -- Server Component; not a client render
  const initialNowMs = Date.now();

  return (
    <DropsPagePanel
      seedQuery={query}
      seedPromise={seedPromise}
      initialNowMs={initialNowMs}
    />
  );
}
