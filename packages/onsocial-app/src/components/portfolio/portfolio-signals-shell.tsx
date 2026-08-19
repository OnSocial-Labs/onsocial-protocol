'use client';

import { useState } from 'react';
import { PortfolioSignals } from '@/components/portfolio/portfolio-signals';
import { ReputationFactsSheet } from '@/features/leaderboard/reputation-facts-sheet';
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
  const { signals: liveSignals, viewerStanding, theyStandWithViewer, relationshipLoading } =
    useLiveProfileSignals(accountId, signals);
  const [reputationOpen, setReputationOpen] = useState(false);

  if (!profileSignalsHaveFaceMetrics(liveSignals)) {
    return null;
  }

  return (
    <>
      <PortfolioSignals
        accountId={accountId}
        signals={liveSignals}
        viewerStanding={viewerStanding}
        theyStandWithViewer={theyStandWithViewer}
        relationshipLoading={relationshipLoading}
        onReputationOpen={() => setReputationOpen(true)}
      />
      <ReputationFactsSheet
        open={reputationOpen}
        onOpenChange={setReputationOpen}
        accountId={accountId}
        reputation={signals.reputation}
      />
    </>
  );
}
