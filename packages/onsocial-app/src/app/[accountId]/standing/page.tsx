import { panelLabel } from '@/lib/overlay-routes';
import { StandingPanel } from '@/components/panels/standing-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { resolveAccountPage } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function StandingPage({ params }: PanelRouteProps) {
  const { accountId, data } = await resolveAccountPage(params);

  return (
    <PanelPage accountId={accountId} title={panelLabel('standing')}>
      <StandingPanel
        accountId={accountId}
        standingCount={data.stats.standingCount}
      />
    </PanelPage>
  );
}
