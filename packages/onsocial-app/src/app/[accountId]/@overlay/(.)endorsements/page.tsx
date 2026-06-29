import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { panelLabel } from '@/lib/overlay-routes';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
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
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} title={title}>
        <EndorsementsPanel accountId={accountId} />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
