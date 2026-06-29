import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { StandingOverlayRoute } from '@/components/panels/standing-overlay-route';
import { loadStandingListPage } from '@/lib/load-standing-list-page';
import { parseStandingKind } from '@/lib/profile-social-standings';
import { displayName } from '@/lib/profile-display';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingKindOverlayProps = {
  params: Promise<{
    accountId: string;
    kind: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export default async function StandingKindOverlay({
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
  const [shell, signals, initialList] = await Promise.all([
    loadProfileShell(accountId),
    fetchProfileSignals(accountId),
    loadStandingListPage(accountId, kind, initialQuery),
  ]);
  const name = displayName(accountId, shell?.name ?? undefined);

  return (
    <OverlayInterceptRoot>
      <StandingOverlayRoute
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
      />
    </OverlayInterceptRoot>
  );
}
