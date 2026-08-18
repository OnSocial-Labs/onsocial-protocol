'use client';

import { useState } from 'react';
import { PortfolioSignals } from '@/components/portfolio/portfolio-signals';
import { ReputationFactsSheet } from '@/features/leaderboard/reputation-facts-sheet';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
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
  const { viewerStanding, theyStandWithViewer, isLoading } =
    useViewerRelationship(accountId);
  const [reputationOpen, setReputationOpen] = useState(false);

  if (!profileSignalsHaveFaceMetrics(signals)) {
    return null;
  }

  return (
    <>
      <PortfolioSignals
        accountId={accountId}
        signals={signals}
        viewerStanding={viewerStanding}
        theyStandWithViewer={theyStandWithViewer}
        relationshipLoading={isLoading}
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
