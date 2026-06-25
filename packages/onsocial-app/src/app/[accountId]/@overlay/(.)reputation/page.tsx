import { panelLabel } from '@/lib/overlay-routes';
import { ReputationPanel } from '@/components/panels/reputation-panel';
import { GlassOverlayShell } from '@/components/overlay/glass-overlay-shell';
import { fetchProfileReputation } from '@/lib/profile-signals';
import { resolveAccountId } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function ReputationOverlay({ params }: OverlayRouteProps) {
  const accountId = await resolveAccountId(params);
  const reputation = await fetchProfileReputation(accountId);

  return (
    <GlassOverlayShell accountId={accountId} title={panelLabel('reputation')}>
      <ReputationPanel accountId={accountId} reputation={reputation} />
    </GlassOverlayShell>
  );
}
