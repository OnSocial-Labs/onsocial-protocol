import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';
import { loadDiscoverProfilesPage } from '@/lib/discover-profiles-server';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type DiscoverAccountPageProps = {
  params: Promise<{
    accountId: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export default async function DiscoverAccountPage({
  params,
  searchParams,
}: DiscoverAccountPageProps) {
  const accountId = await resolveAccountId(params);
  const resolvedSearchParams = await searchParams;
  const initialQuery = normalizeProfileSearchQuery(
    Array.isArray(resolvedSearchParams?.q)
      ? resolvedSearchParams.q[0]
      : resolvedSearchParams?.q
  );
  const initialPage = await loadDiscoverProfilesPage(initialQuery, null, 0).catch(
    () => null
  );

  return (
    <DiscoverPagePanel
      backFallbackHref={portfolioPath(accountId)}
      initialPage={initialPage}
    />
  );
}
