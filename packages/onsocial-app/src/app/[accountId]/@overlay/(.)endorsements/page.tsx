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
import { normalizeAccountRoute } from '@/lib/account-route';
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
  params,
  searchParams,
}: OverlayRouteProps) {
  const accountId = await resolveAccountId(params);
  const resolvedSearch = await searchParams;
  const rawMode = Array.isArray(resolvedSearch?.mode)
    ? resolvedSearch.mode[0]
    : resolvedSearch?.mode;
  const initialMode = parseEndorsementsMode(rawMode) ?? 'received';
  const [shell, initial] = await Promise.all([
    loadProfileShell(accountId),
    loadEndorsementsPageData(accountId),
  ]);
  return (
    <>
      <PortfolioFaceOverlayLeave accountId={accountId} />
      <EndorsementsPanel
        accountId={accountId}
        profileName={shell?.name ?? null}
        avatarUrl={shell?.avatarUrl ?? null}
        initial={initial}
        initialMode={initialMode}
      />
    </>
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
  // Frame + `.endorsements-panel` seat before resolveAccountId / list data.
  // Soft-open must paint the intercept root immediately so glass stays up
  // while children briefly match the peek segment.
  const accountHint = normalizeAccountRoute(routeSegment) ?? routeSegment;
  const title = panelLabel('endorsements');
  return (
    <OverlayInterceptRoot>
      <EndorsementsOverlayFrame ariaTitle={title} title={title}>
        <Suspense
          fallback={
            <>
              <PortfolioFaceOverlayLeave accountId={accountHint} />
              <EndorsementsPanelSeat />
            </>
          }
        >
          <EndorsementsOverlayBody
            params={params}
            searchParams={searchParams}
          />
        </Suspense>
      </EndorsementsOverlayFrame>
    </OverlayInterceptRoot>
  );
}
