'use client';

import { usePortfolioProfileSeed } from '@/contexts/portfolio-profile-seed-context';
import { displayName as resolveDisplayName } from '@/lib/profile-display';
import type { StandingInitialList } from '@/lib/load-standing-list-page';
import type { StanceDetailKind } from '@/lib/profile-social-standings';
import { StandingOverlaySheet } from '@/components/panels/standing-panel';

export function StandingOverlayRoute({
  accountId,
  kind,
  initialQuery,
  displayName: serverDisplayName,
  avatarUrl: serverAvatarUrl,
  initialCounts: serverCounts,
  initialList = null,
}: {
  accountId: string;
  kind: StanceDetailKind;
  initialQuery: string;
  displayName?: string;
  avatarUrl?: string | null;
  initialCounts?: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  initialList?: StandingInitialList | null;
}) {
  const seed = usePortfolioProfileSeed(accountId);
  const fallbackName = resolveDisplayName(accountId);

  return (
    <StandingOverlaySheet
      accountId={accountId}
      kind={kind}
      initialQuery={initialQuery}
      displayName={serverDisplayName ?? seed?.displayName ?? fallbackName}
      avatarUrl={serverAvatarUrl ?? seed?.avatarUrl ?? null}
      initialCounts={
        serverCounts ??
        seed?.counts ?? { incoming: 0, outgoing: 0, mutual: 0 }
      }
      initialList={initialList}
      profileMetaFromServer
    />
  );
}
