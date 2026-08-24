import { Suspense } from 'react';
import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';
import { loadCollectiblesPageData } from '@/lib/load-collectibles-page';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function PortfolioCollectiblesPage({
  params,
}: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const initial = await loadCollectiblesPageData(accountId);

  return (
    <Suspense fallback={null}>
      <CollectiblesPagePanel
        shell="portfolio"
        pageAccountId={accountId}
        initialAccountId={initial.accountId}
        initialHoldings={initial.holdings}
      />
    </Suspense>
  );
}
