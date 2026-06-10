import { panelLabel } from '@/lib/overlay-routes';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import { GlassOverlayShell } from '@/components/overlay/glass-overlay-shell';
import { resolveAccountId } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function EndorsementsOverlay({ params }: OverlayRouteProps) {
  const accountId = await resolveAccountId(params);
  const title = panelLabel('endorsements');

  return (
    <GlassOverlayShell accountId={accountId} title={title}>
      <EndorsementsPanel accountId={accountId} />
    </GlassOverlayShell>
  );
}
