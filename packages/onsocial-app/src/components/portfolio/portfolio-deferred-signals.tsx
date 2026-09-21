import { PortfolioProfileSeed } from '@/components/portfolio/portfolio-profile-seed';
import { PortfolioSignalsShell } from '@/components/portfolio/portfolio-signals-shell';
import { fetchProfileSignals } from '@/lib/profile-signals';

/** Standing-ledger seed after first HTML — React `cache` shares with the row. */
export async function PortfolioDeferredProfileSeed({
  accountId,
  displayName,
  avatarUrl,
}: {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const signals = await fetchProfileSignals(accountId);
  return (
    <PortfolioProfileSeed
      accountId={accountId}
      displayName={displayName}
      avatarUrl={avatarUrl}
      counts={{
        incoming: signals?.standingCount ?? 0,
        outgoing: signals?.standingWithCount ?? 0,
        mutual: signals?.mutualStandingCount ?? 0,
      }}
    />
  );
}

/** Face metrics row after first HTML. */
export async function PortfolioDeferredSignals({
  accountId,
}: {
  accountId: string;
}) {
  const signals = await fetchProfileSignals(accountId);
  if (!signals) return null;
  return <PortfolioSignalsShell accountId={accountId} signals={signals} />;
}
