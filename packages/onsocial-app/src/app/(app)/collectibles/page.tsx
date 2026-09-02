import type { Metadata } from 'next';
import { CollectiblesOsEntry } from '@/features/collectibles/collectibles-os-entry';
import {
  COLLECTIBLES_SEARCH_PARAM,
  MARKET_AUDIO_FORMAT_PARAM,
  MARKET_FACETS_PARAM,
  MARKET_KIND_PARAM,
} from '@/lib/app-routes';
import {
  loadCollectiblesPageData,
  parseCollectiblesPageQuery,
} from '@/lib/load-collectibles-page';

export const metadata: Metadata = {
  title: 'Collectibles • OnSocial',
  description: 'Collectibles vault — read, play, and open what you hold.',
};

type CollectiblesOsPageProps = {
  searchParams?: Promise<{
    [COLLECTIBLES_SEARCH_PARAM]?: string | string[];
    [MARKET_KIND_PARAM]?: string | string[];
    [MARKET_FACETS_PARAM]?: string | string[];
    [MARKET_AUDIO_FORMAT_PARAM]?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function CollectiblesPage({
  searchParams,
}: CollectiblesOsPageProps) {
  // Wallet is client-only — disconnected shell; connected clients soft-redirect
  // to `/@you/collectibles` and keep the discovery query.
  const resolved = (await searchParams) ?? {};
  const query = parseCollectiblesPageQuery({
    q: firstParam(resolved[COLLECTIBLES_SEARCH_PARAM]),
    kind: firstParam(resolved[MARKET_KIND_PARAM]),
    facets: firstParam(resolved[MARKET_FACETS_PARAM]),
    audioFormat: firstParam(resolved[MARKET_AUDIO_FORMAT_PARAM]),
  });
  const seedPromise = loadCollectiblesPageData(null);

  return (
    <CollectiblesOsEntry seedQuery={query} seedPromise={seedPromise} />
  );
}
