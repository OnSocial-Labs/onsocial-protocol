import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';
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
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
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

export default async function PortfolioCollectiblesPage({
  params,
  searchParams,
}: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const resolved = (await searchParams) ?? {};
  const query = parseCollectiblesPageQuery({
    q: firstParam(resolved[COLLECTIBLES_SEARCH_PARAM]),
    kind: firstParam(resolved[MARKET_KIND_PARAM]),
    facets: firstParam(resolved[MARKET_FACETS_PARAM]),
    audioFormat: firstParam(resolved[MARKET_AUDIO_FORMAT_PARAM]),
  });
  // Do not await holdings here — that remounts the shell via loading.tsx
  // on every kind / search replace. The panel consumes the promise.
  const seedPromise = loadCollectiblesPageData(accountId);

  return (
    <CollectiblesPagePanel
      shell="portfolio"
      pageAccountId={accountId}
      seedQuery={query}
      seedPromise={seedPromise}
    />
  );
}
