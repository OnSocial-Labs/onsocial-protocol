import { panelLabel } from '@/lib/overlay-routes';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { PanelPage } from '@/components/panels/panel-page';
import { StandingPagePanel } from '@/components/panels/standing-panel';
import { loadStandingListPage } from '@/lib/load-standing-list-page';
import {
  parseStandingKind,
  standingPath,
} from '@/lib/profile-social-standings';
import { displayName } from '@/lib/profile-display';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolvePortfolioDaoEntity } from '@/lib/portfolio-dao-entity';
import { resolveAccountId } from '@/lib/resolve-account';
import { redirect } from 'next/navigation';

type StandingKindPageProps = {
  params: Promise<{
    accountId: string;
    kind: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

/**
 * Hard refresh / shared link — full-page standing fallback.
 * Soft nav still opens the glass sheet via `@overlay/(.)standing`.
 */
export default async function StandingKindPage({
  params,
  searchParams,
}: StandingKindPageProps) {
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
    <PanelPage accountId={accountId} title={panelLabel('standing')}>
      <StandingPagePanel
        accountId={accountId}
        kind={kind}
        initialQuery={initialQuery}
        displayName={name}
        avatarUrl={shell?.avatarUrl ?? null}
        initialCounts={{
          incoming: signals?.standingCount ?? 0,
          outgoing: signals?.standingWithCount ?? 0,
          mutual: signals?.mutualStandingCount ?? 0,
        }}
        initialList={initialList}
        profileMetaFromServer
        isDaoSubject={isDaoSubject}
      />
    </PanelPage>
  );
}
