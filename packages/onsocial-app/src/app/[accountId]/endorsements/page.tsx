import { panelLabel } from '@/lib/overlay-routes';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function EndorsementsPage({ params }: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const title = panelLabel('endorsements');

  return (
    <PanelPage accountId={accountId} title={title}>
      <EndorsementsPanel accountId={accountId} />
    </PanelPage>
  );
}
