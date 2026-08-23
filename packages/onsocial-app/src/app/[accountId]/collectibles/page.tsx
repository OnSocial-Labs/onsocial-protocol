import { Suspense } from 'react';
import { panelLabel } from '@/lib/overlay-routes';
import { CollectiblesHeaderActions } from '@/features/collectibles/collectibles-header-actions';
import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';
import { PanelPage } from '@/components/panels/panel-page';
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
  const title = panelLabel('collectibles');

  return (
    <PanelPage
      accountId={accountId}
      title={title}
      headerActions={<CollectiblesHeaderActions pageAccountId={accountId} />}
    >
      <Suspense fallback={null}>
        <CollectiblesPagePanel
          pageAccountId={accountId}
          initialAccountId={initial.accountId}
          initialHoldings={initial.holdings}
          embedded
        />
      </Suspense>
    </PanelPage>
  );
}
