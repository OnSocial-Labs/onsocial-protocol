import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';
import { parseDiscoverProfileFilters } from '@/lib/discover-profiles';
import { loadDiscoverProfilesPage } from '@/lib/discover-profiles-server';
import { loadDiscoverTrendingSeed } from '@/lib/discover-trending-server';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type DiscoverAccountPageProps = {
  params: Promise<{
    accountId: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
    face?: string | string[];
    industry?: string | string[];
    craft?: string | string[];
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
  const [initialPage, initialTrending] = await Promise.all([
    loadDiscoverProfilesPage(
      initialQuery,
      null,
      0,
      24,
      parseDiscoverProfileFilters({
        face: Array.isArray(resolvedSearchParams?.face)
          ? resolvedSearchParams.face[0]
          : resolvedSearchParams?.face,
        industry: Array.isArray(resolvedSearchParams?.industry)
          ? resolvedSearchParams.industry[0]
          : resolvedSearchParams?.industry,
        craft: Array.isArray(resolvedSearchParams?.craft)
          ? resolvedSearchParams.craft[0]
          : resolvedSearchParams?.craft,
      })
    ).catch(() => null),
    loadDiscoverTrendingSeed(),
  ]);

  return (
    <DiscoverPagePanel
      backFallbackHref={portfolioPath(accountId)}
      initialPage={initialPage}
      initialTrending={initialTrending}
    />
  );
}
