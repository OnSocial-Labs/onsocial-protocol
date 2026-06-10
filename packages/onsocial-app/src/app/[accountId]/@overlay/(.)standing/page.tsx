import { panelLabel } from '@/lib/overlay-routes';
import { StandingPanel } from '@/components/panels/standing-panel';
import { GlassOverlayShell } from '@/components/overlay/glass-overlay-shell';
import { resolveAccountPage } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function StandingOverlay({ params }: OverlayRouteProps) {
  const { accountId, data } = await resolveAccountPage(params);
  const title = panelLabel('standing');

  return (
    <GlassOverlayShell accountId={accountId} title={title}>
      <StandingPanel
        accountId={accountId}
        standingCount={data.stats.standingCount}
      />
    </GlassOverlayShell>
  );
}
