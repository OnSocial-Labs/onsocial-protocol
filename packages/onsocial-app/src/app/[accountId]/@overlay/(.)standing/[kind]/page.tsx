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
  type StanceDetailKind,
} from '@/lib/profile-social-standings';
import { displayName } from '@/lib/profile-display';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolvePortfolioDaoEntity } from '@/lib/portfolio-dao-entity';
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
  accountId,
  kind,
  initialQuery,
  isDaoSubject,
}: {
  accountId: string;
  kind: StanceDetailKind;
  initialQuery: string;
  isDaoSubject: boolean;
}) {
  const [shell, signals, initialList] = await Promise.all([
    loadProfileShell(accountId),
    fetchProfileSignals(accountId),
    loadStandingListPage(accountId, kind, initialQuery),
  ]);
  const name = displayName(accountId, shell?.name ?? undefined);

  return (
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
  );
}

export default async function StandingKindOverlay({
  params,
  searchParams,
}: StandingKindOverlayProps) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
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

  // Same seat as StandingSheetOpening while list/signals stream in.
  return (
    <OverlayInterceptRoot>
      <PortfolioFaceOverlayLeave accountId={accountId} />
      <Suspense
        fallback={
          <StandingOverlaySheet
            accountId={accountId}
            kind={kind}
            displayName={accountId}
            avatarUrl={null}
            initialCounts={{ incoming: 0, outgoing: 0, mutual: 0 }}
            listPreview
          />
        }
      >
        <StandingOverlayBody
          accountId={accountId}
          kind={kind}
          initialQuery={initialQuery}
          isDaoSubject={isDaoSubject}
        />
      </Suspense>
    </OverlayInterceptRoot>
  );
}
