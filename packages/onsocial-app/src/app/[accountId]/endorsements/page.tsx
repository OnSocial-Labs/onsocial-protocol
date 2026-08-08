import { panelLabel } from '@/lib/overlay-routes';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { loadEndorsementsPageData } from '@/lib/load-endorsements-page';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function EndorsementsPage({ params }: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const title = panelLabel('endorsements');
  const initial = await loadEndorsementsPageData(accountId);

  return (
    <PanelPage accountId={accountId} title={title}>
      <EndorsementsPanel accountId={accountId} initial={initial} />
    </PanelPage>
  );
}
