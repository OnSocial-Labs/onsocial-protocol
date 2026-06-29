import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { StandingPageShell } from '@/components/panels/standing-panel';
import { loadStandingListPage } from '@/lib/load-standing-list-page';
import { parseStandingKind } from '@/lib/profile-social-standings';
import { displayName } from '@/lib/profile-display';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingKindPageProps = {
  params: Promise<{
    accountId: string;
    kind: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

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
  const [shell, signals, initialList] = await Promise.all([
    loadProfileShell(accountId),
    fetchProfileSignals(accountId),
    loadStandingListPage(accountId, kind, initialQuery),
  ]);
  const name = displayName(accountId, shell?.name ?? undefined);

  return (
    <StandingPageShell
      accountId={accountId}
      displayName={name}
      avatarUrl={shell?.avatarUrl ?? null}
      kind={kind}
      initialCounts={{
        incoming: signals?.standingCount ?? 0,
        outgoing: signals?.standingWithCount ?? 0,
        mutual: signals?.mutualStandingCount ?? 0,
      }}
      initialQuery={initialQuery}
      initialList={initialList}
      profileMetaFromServer
    />
  );
}
