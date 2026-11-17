import { Suspense } from 'react';
import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { PortfolioFaceOverlayLeave } from '@/components/portfolio/portfolio-face-overlay-leave';
import { panelLabel } from '@/lib/overlay-routes';
import { EndorsementsPanel } from '@/components/panels/endorsements-panel';
import { EndorsementsOverlayFrame } from '@/components/overlay/endorsements-overlay-frame';
import { EndorsementsPanelSeat } from '@/components/panels/endorsements-sheet-opening';
import {
  loadEndorsementsPageData,
  parseEndorsementsMode,
} from '@/lib/load-endorsements-page';
import { loadProfileShell } from '@/lib/profile-shell';
import {
  isInterceptMisfireSegment,
  resolveAccountId,
} from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
  searchParams?: Promise<{
    mode?: string | string[];
  }>;
};

async function EndorsementsOverlayBody({
  accountId,
  initialMode,
}: {
  accountId: string;
  initialMode: 'received' | 'given';
}) {
  const [shell, initial] = await Promise.all([
    loadProfileShell(accountId),
    loadEndorsementsPageData(accountId),
  ]);
  return (
    <EndorsementsPanel
      accountId={accountId}
      profileName={shell?.name ?? null}
      avatarUrl={shell?.avatarUrl ?? null}
      initial={initial}
      initialMode={initialMode}
    />
  );
}

export default async function EndorsementsOverlay({
  params,
  searchParams,
}: OverlayRouteProps) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const accountId = await resolveAccountId(params);
  const resolvedSearch = await searchParams;
  const rawMode = Array.isArray(resolvedSearch?.mode)
    ? resolvedSearch.mode[0]
    : resolvedSearch?.mode;
  const initialMode = parseEndorsementsMode(rawMode) ?? 'received';
  const title = panelLabel('endorsements');
  // Frame + `.endorsements-panel` seat first (Standing soft-open pattern).
  // List data streams in under Suspense so a stalled indexer cannot blank
  // the intercept while @overlay/loading is still swapping in.
  return (
    <OverlayInterceptRoot>
      <EndorsementsOverlayFrame ariaTitle={title} title={title}>
        <PortfolioFaceOverlayLeave accountId={accountId} />
        <Suspense fallback={<EndorsementsPanelSeat />}>
          <EndorsementsOverlayBody
            accountId={accountId}
            initialMode={initialMode}
          />
        </Suspense>
      </EndorsementsOverlayFrame>
    </OverlayInterceptRoot>
  );
}
