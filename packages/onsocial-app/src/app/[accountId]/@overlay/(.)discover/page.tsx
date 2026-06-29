import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { DiscoverOverlaySheet } from '@/features/discover/discover-panel';
import { loadDiscoverProfilesPage } from '@/lib/discover-profiles-server';
import { resolveAccountId } from '@/lib/resolve-account';

type DiscoverOverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

export default async function DiscoverOverlayRoute({
  params,
  searchParams,
}: DiscoverOverlayRouteProps) {
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
    <OverlayInterceptRoot>
      <DiscoverOverlaySheet accountId={accountId} initialPage={initialPage} />
    </OverlayInterceptRoot>
  );
}
