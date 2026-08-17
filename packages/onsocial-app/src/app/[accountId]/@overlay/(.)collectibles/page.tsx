import { Suspense } from 'react';
import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { panelLabel } from '@/lib/overlay-routes';
import { CollectiblesPagePanel } from '@/features/collectibles/collectibles-page-panel';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { loadCollectiblesPageData } from '@/lib/load-collectibles-page';
import { resolveAccountId } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function CollectiblesOverlay({
  params,
}: OverlayRouteProps) {
  const accountId = await resolveAccountId(params);
  const initial = await loadCollectiblesPageData(accountId);
  const title = panelLabel('collectibles');

  return (
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} title={title}>
        <Suspense fallback={null}>
          <CollectiblesPagePanel
            pageAccountId={accountId}
            initialAccountId={initial.accountId}
            initialHoldings={initial.holdings}
            embedded
          />
        </Suspense>
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
