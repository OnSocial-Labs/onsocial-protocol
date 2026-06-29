'use client';

import { PortfolioSignals } from '@/components/portfolio/portfolio-signals';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import type { ProfileSignals } from '@/lib/profile-signals';

interface PortfolioSignalsShellProps {
  accountId: string;
  signals: ProfileSignals;
}

export function PortfolioSignalsShell({
  accountId,
  signals,
}: PortfolioSignalsShellProps) {
  const { viewerStanding, theyStandWithViewer } =
    useViewerRelationship(accountId);

  return (
    <PortfolioSignals
      accountId={accountId}
      signals={signals}
      viewerStanding={viewerStanding}
      theyStandWithViewer={theyStandWithViewer}
    />
  );
}
