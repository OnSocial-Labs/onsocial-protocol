'use client';

import { usePortfolioProfileSeed } from '@/contexts/portfolio-profile-seed-context';
import { displayName as resolveDisplayName } from '@/lib/profile-display';
import type {
  NetworkAccount,
  NetworkFilterKind,
  NetworkStandingCounts,
} from '@/lib/profile-network';
import { NetworkOrbitOverlaySheet } from '@/components/panels/network-orbit-sheet';

export function NetworkOrbitOverlayRoute({
  accountId,
  displayName: serverDisplayName,
  avatarUrl: serverAvatarUrl,
  initialAccounts = null,
  initialCounts = null,
  initialFilter = 'all',
  initialQuery = '',
}: {
  accountId: string;
  displayName?: string;
  avatarUrl?: string | null;
  initialAccounts?: NetworkAccount[] | null;
  initialCounts?: NetworkStandingCounts | null;
  initialFilter?: NetworkFilterKind;
  initialQuery?: string;
}) {
  const seed = usePortfolioProfileSeed(accountId);

  return (
    <NetworkOrbitOverlaySheet
      key={accountId}
      accountId={accountId}
      displayName={
        serverDisplayName ?? seed?.displayName ?? resolveDisplayName(accountId)
      }
      avatarUrl={serverAvatarUrl ?? seed?.avatarUrl ?? null}
      initialAccounts={initialAccounts}
      initialCounts={initialCounts}
      initialFilter={initialFilter}
      initialQuery={initialQuery}
    />
  );
}
