'use client';

import { PortfolioSignals } from '@/components/portfolio/portfolio-signals';
import { useLiveProfileSignals } from '@/hooks/use-live-profile-signals';
import {
  profileSignalsHaveFaceMetrics,
  type ProfileSignals,
} from '@/lib/profile-signals';

interface PortfolioSignalsShellProps {
  accountId: string;
  signals: ProfileSignals;
}

export function PortfolioSignalsShell({
  accountId,
  signals,
}: PortfolioSignalsShellProps) {
  const {
    signals: liveSignals,
    viewerStanding,
    theyStandWithViewer,
    relationshipLoading,
  } = useLiveProfileSignals(accountId, signals);

  if (!profileSignalsHaveFaceMetrics(liveSignals)) {
    return null;
  }

  return (
    <PortfolioSignals
      accountId={accountId}
      signals={liveSignals}
      viewerStanding={viewerStanding}
      theyStandWithViewer={theyStandWithViewer}
      relationshipLoading={relationshipLoading}
    />
  );
}
