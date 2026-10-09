import { NetworkOrbitPagePanel } from '@/components/panels/network-orbit-sheet';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { displayName } from '@/lib/profile-display';
import { parseNetworkFilter } from '@/lib/profile-network';
import { loadProfileNetworkOrbit } from '@/lib/profile-network-server';
import { loadProfileShell } from '@/lib/profile-shell';
import { createAppOnSocialClient } from '@/lib/profile-social-server';
import { resolveAccountId } from '@/lib/resolve-account';

type NetworkAccountPageProps = {
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

/** Full-screen network map — shared link, hard refresh, and the standing globe. */
export default async function NetworkAccountPage({
  params,
  searchParams,
}: NetworkAccountPageProps) {
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
    loadProfileNetworkOrbit(os, accountId, null, {}).catch(() => null),
  ]);

  return (
    <NetworkOrbitPagePanel
      accountId={accountId}
      displayName={displayName(accountId, shell?.name ?? undefined)}
      avatarUrl={shell?.avatarUrl ?? null}
      initialAccounts={orbit?.accounts ?? null}
      initialCounts={orbit?.counts ?? null}
      initialCenterMood={orbit?.centerMood ?? null}
      initialViewerKnownCount={orbit?.viewerKnownCount ?? 0}
      initialSubjectEndorsedCount={orbit?.subjectEndorsedCount ?? 0}
      initialFilter={initialFilter}
      initialQuery={initialQuery}
    />
  );
}
