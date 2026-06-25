import { panelLabel } from '@/lib/overlay-routes';
import { ReputationPanel } from '@/components/panels/reputation-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { fetchProfileReputation } from '@/lib/profile-signals';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function ReputationPage({ params }: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const reputation = await fetchProfileReputation(accountId);

  return (
    <PanelPage accountId={accountId} title={panelLabel('reputation')}>
      <ReputationPanel accountId={accountId} reputation={reputation} />
    </PanelPage>
  );
}
