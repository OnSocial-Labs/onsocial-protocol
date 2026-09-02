import type { Metadata } from 'next';
import { MarketPagePanel } from '@/features/market/market-page-panel';
import {
  loadMarketPageData,
  parseMarketPageQuery,
} from '@/lib/load-market-page';
import {
  MARKET_APP_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  MARKET_CREATOR_PARAM,
  MARKET_FACETS_PARAM,
  MARKET_KIND_PARAM,
  MARKET_SORT_PARAM,
} from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'Market • OnSocial',
  description: 'Browse and buy Scarces on OnSocial.',
};

type MarketPageProps = {
  searchParams?: Promise<{
    [MARKET_KIND_PARAM]?: string | string[];
    [MARKET_CREATOR_PARAM]?: string | string[];
    [MARKET_APP_PARAM]?: string | string[];
    [MARKET_FACETS_PARAM]?: string | string[];
    [MARKET_AUDIO_FORMAT_PARAM]?: string | string[];
    [MARKET_SORT_PARAM]?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function MarketPage({ searchParams }: MarketPageProps) {
  const resolved = (await searchParams) ?? {};
  const query = parseMarketPageQuery({
    kind: firstParam(resolved[MARKET_KIND_PARAM]),
    creator: firstParam(resolved[MARKET_CREATOR_PARAM]),
    app: firstParam(resolved[MARKET_APP_PARAM]),
    facets: firstParam(resolved[MARKET_FACETS_PARAM]),
    audioFormat: firstParam(resolved[MARKET_AUDIO_FORMAT_PARAM]),
    sort: firstParam(resolved[MARKET_SORT_PARAM]),
  });
  // Do not await the catalog here — that remounts the shell via loading.tsx
  // on every filter replace. The panel consumes the promise in the list slot.
  const seedPromise = loadMarketPageData(query);

  return <MarketPagePanel seedQuery={query} seedPromise={seedPromise} />;
}
