import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { PortfolioFaceOverlayLeave } from '@/components/portfolio/portfolio-face-overlay-leave';
import { NetworkOrbitOverlayRoute } from '@/components/panels/network-orbit-route';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { displayName } from '@/lib/profile-display';
import { parseNetworkFilter } from '@/lib/profile-network';
import { loadProfileNetworkOrbit } from '@/lib/profile-network-server';
import { loadProfileShell } from '@/lib/profile-shell';
import { createAppOnSocialClient } from '@/lib/profile-social-server';
import {
  isInterceptMisfireSegment,
  resolveAccountId,
} from '@/lib/resolve-account';

type NetworkOverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
  searchParams?: Promise<{
    filter?: string | string[];
    q?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function NetworkOverlayRoute({
  params,
  searchParams,
}: NetworkOverlayRouteProps) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const accountId = await resolveAccountId(params);
  const resolvedSearchParams = await searchParams;
  const initialQuery = normalizeProfileSearchQuery(
    firstParam(resolvedSearchParams?.q)
  );
  const initialFilter = parseNetworkFilter(
    firstParam(resolvedSearchParams?.filter)
  );

  const os = createAppOnSocialClient();
  const [shell, orbit] = await Promise.all([
    loadProfileShell(accountId),
    // Viewer-relative badges don't render on the orbit — viewer stays null.
    loadProfileNetworkOrbit(os, accountId, null, {}).catch(() => null),
  ]);

  return (
    <OverlayInterceptRoot>
      <PortfolioFaceOverlayLeave accountId={accountId} />
      <NetworkOrbitOverlayRoute
        accountId={accountId}
        displayName={displayName(accountId, shell?.name ?? undefined)}
        avatarUrl={shell?.avatarUrl ?? null}
        initialAccounts={orbit?.accounts ?? null}
        initialCounts={orbit?.counts ?? null}
        initialFilter={initialFilter}
        initialQuery={initialQuery}
      />
    </OverlayInterceptRoot>
  );
}
