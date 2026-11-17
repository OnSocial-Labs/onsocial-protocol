import { Suspense } from 'react';
import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { PortfolioFaceOverlayLeave } from '@/components/portfolio/portfolio-face-overlay-leave';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { StandingOverlayRoute } from '@/components/panels/standing-overlay-route';
import { StandingOverlaySheet } from '@/components/panels/standing-panel';
import { loadStandingListPage } from '@/lib/load-standing-list-page';
import {
  parseStandingKind,
  standingPath,
} from '@/lib/profile-social-standings';
import { displayName } from '@/lib/profile-display';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolvePortfolioDaoEntity } from '@/lib/portfolio-dao-entity';
import { normalizeAccountRoute } from '@/lib/account-route';
import {
  isInterceptMisfireSegment,
  resolveAccountId,
} from '@/lib/resolve-account';
import { redirect } from 'next/navigation';

type StandingKindOverlayProps = {
  params: Promise<{
    accountId: string;
    kind: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

async function StandingOverlayBody({
  params,
  searchParams,
}: StandingKindOverlayProps) {
  const accountId = await resolveAccountId(params);
  const { kind: kindParam } = await params;
  const kind = parseStandingKind(kindParam);
  const resolvedSearchParams = await searchParams;
  const initialQuery = normalizeProfileSearchQuery(
    Array.isArray(resolvedSearchParams?.q)
      ? resolvedSearchParams.q[0]
      : resolvedSearchParams?.q
  );
  const daoEntity = await resolvePortfolioDaoEntity(accountId);
  const isDaoSubject = daoEntity.isDao;
  if (isDaoSubject && kind !== 'incoming') {
    redirect(standingPath(accountId, 'incoming', initialQuery));
  }

  const [shell, signals, initialList] = await Promise.all([
    loadProfileShell(accountId),
    fetchProfileSignals(accountId),
    loadStandingListPage(accountId, kind, initialQuery),
  ]);
  const name = displayName(accountId, shell?.name ?? undefined);

  return (
    <>
      <PortfolioFaceOverlayLeave accountId={accountId} />
      <StandingOverlayRoute
        accountId={accountId}
        kind={kind}
        initialQuery={initialQuery}
        displayName={name}
        avatarUrl={shell?.avatarUrl ?? null}
        profileKind={shell?.kind ?? null}
        initialCounts={{
          incoming: signals?.standingCount ?? 0,
          outgoing: signals?.standingWithCount ?? 0,
          mutual: signals?.mutualStandingCount ?? 0,
        }}
        initialList={initialList}
        isDaoSubject={isDaoSubject}
      />
    </>
  );
}

export default async function StandingKindOverlay({
  params,
  searchParams,
}: StandingKindOverlayProps) {
  const { accountId: routeSegment, kind: kindParam } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const kind = parseStandingKind(kindParam);
  const accountHint = normalizeAccountRoute(routeSegment) ?? routeSegment;

  // Intercept seat before resolveAccountId / dao / list — same job as
  // StandingSheetOpening while the body streams in.
  return (
    <OverlayInterceptRoot>
      <Suspense
        fallback={
          <>
            <PortfolioFaceOverlayLeave accountId={accountHint} />
            <StandingOverlaySheet
              accountId={accountHint}
              kind={kind}
              displayName={accountHint}
              avatarUrl={null}
              initialCounts={{ incoming: 0, outgoing: 0, mutual: 0 }}
              listPreview
            />
          </>
        }
      >
        <StandingOverlayBody params={params} searchParams={searchParams} />
      </Suspense>
    </OverlayInterceptRoot>
  );
}
