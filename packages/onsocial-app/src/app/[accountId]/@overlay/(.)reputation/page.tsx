import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { panelLabel } from '@/lib/overlay-routes';
import { ReputationPanel } from '@/components/panels/reputation-panel';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
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
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={panelLabel('reputation')} title={panelLabel('reputation')}>
        <ReputationPanel accountId={accountId} reputation={reputation} />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
