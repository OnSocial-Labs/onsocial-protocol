import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { PortfolioFaceOverlayLeave } from '@/components/portfolio/portfolio-face-overlay-leave';
import { panelLabel } from '@/lib/overlay-routes';
import { ReputationPanel } from '@/components/panels/reputation-panel';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { LeaderboardChartAction } from '@/features/leaderboard/leaderboard-chart-action';
import { fetchProfileReputation } from '@/lib/profile-signals';
import {
  isInterceptMisfireSegment,
  resolveAccountId,
} from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function ReputationOverlay({ params }: OverlayRouteProps) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const accountId = await resolveAccountId(params);
  const reputation = await fetchProfileReputation(accountId);

  return (
    <OverlayInterceptRoot>
      <SimpleOverlayPanel
        ariaTitle={panelLabel('reputation')}
        title={panelLabel('reputation')}
        headerActions={<LeaderboardChartAction track="reputation" />}
      >
        <PortfolioFaceOverlayLeave accountId={accountId} />
        <ReputationPanel accountId={accountId} reputation={reputation} />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
