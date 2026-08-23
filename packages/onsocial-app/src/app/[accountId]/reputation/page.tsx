import { panelLabel } from '@/lib/overlay-routes';
import { ReputationPanel } from '@/components/panels/reputation-panel';
import { PanelPage } from '@/components/panels/panel-page';
import { LeaderboardChartAction } from '@/features/leaderboard/leaderboard-chart-action';
import { fetchProfileReputation } from '@/lib/profile-signals';
import { resolveAccountId } from '@/lib/resolve-account';

type PanelRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

/**
 * Hard refresh / shared link — full-page reputation fallback.
 * Soft nav still opens the glass sheet via `@overlay/(.)reputation`.
 */
export default async function ReputationPage({ params }: PanelRouteProps) {
  const accountId = await resolveAccountId(params);
  const reputation = await fetchProfileReputation(accountId);
  const title = panelLabel('reputation');

  return (
    <PanelPage
      accountId={accountId}
      title={title}
      headerActions={<LeaderboardChartAction track="reputation" />}
    >
      <ReputationPanel accountId={accountId} reputation={reputation} />
    </PanelPage>
  );
}
