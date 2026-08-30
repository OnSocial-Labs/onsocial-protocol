'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { accountIdsEqual } from '@/lib/account-match';
import type { ProfileSignals } from '@/lib/profile-signals';
import {
  getGlobalViewerStandingLedger,
  getGlobalViewerStandingLedgerVersion,
  subscribeGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';
import { derivePortfolioStandingCounts } from '@/lib/viewer-standing-ledger';
import {
  getGlobalViewerEndorsementLedger,
  getGlobalViewerEndorsementLedgerVersion,
  subscribeGlobalViewerEndorsementLedger,
} from '@/lib/viewer-endorsement-global';
import { derivePortfolioEndorsementCounts } from '@/lib/viewer-endorsement-ledger';

/** Portfolio face metrics — ledger-adjusted until indexer catches up. */
export function useLiveProfileSignals(
  accountId: string,
  baseSignals: ProfileSignals
) {
  const { accountId: viewerAccountId } = useAppWallet();
  const {
    apiViewerStanding,
    theyStandWithViewer,
    apiViewerEndorsed,
    apiViewerEndorsementTopics,
    isLoading: relationshipLoading,
    viewerStanding,
    isLoading,
  } = useViewerRelationship(accountId);
  const [ledgerVersion, setLedgerVersion] = useState(
    () =>
      getGlobalViewerStandingLedgerVersion() +
      getGlobalViewerEndorsementLedgerVersion()
  );

  useEffect(() => {
    const bump = () => {
      setLedgerVersion(
        getGlobalViewerStandingLedgerVersion() +
          getGlobalViewerEndorsementLedgerVersion()
      );
    };
    const unsubStanding = subscribeGlobalViewerStandingLedger(bump);
    const unsubEndorse = subscribeGlobalViewerEndorsementLedger(bump);
    return () => {
      unsubStanding();
      unsubEndorse();
    };
  }, []);

  const isSelf = Boolean(
    viewerAccountId && accountIdsEqual(viewerAccountId, accountId)
  );

  const signals = useMemo(() => {
    const baseCounts = {
      incoming: baseSignals.standingCount,
      outgoing: baseSignals.standingWithCount,
      mutual: baseSignals.mutualStandingCount,
    };

    const adjusted = derivePortfolioStandingCounts({
      pageAccountId: accountId,
      viewerAccountId: viewerAccountId ?? null,
      counts: baseCounts,
      apiViewerStanding,
      theyStandWithViewer,
      ledger: getGlobalViewerStandingLedger(),
      relationshipKnown: isSelf || !relationshipLoading,
    });

    const endorsementCounts = derivePortfolioEndorsementCounts({
      pageAccountId: accountId,
      viewerAccountId: viewerAccountId ?? null,
      counts: {
        received: baseSignals.endorsementsReceivedCount,
        given: baseSignals.endorsementsGivenCount,
      },
      apiViewerEndorsed,
      apiViewerEndorsementTopics,
      ledger: getGlobalViewerEndorsementLedger(),
      relationshipKnown: isSelf || !relationshipLoading,
    });

    return {
      ...baseSignals,
      standingCount: adjusted.incoming,
      standingWithCount: adjusted.outgoing,
      mutualStandingCount: adjusted.mutual,
      endorsementsReceivedCount: endorsementCounts.received,
      endorsementsGivenCount: endorsementCounts.given,
    };
  }, [
    accountId,
    apiViewerEndorsed,
    apiViewerEndorsementTopics,
    apiViewerStanding,
    baseSignals,
    isSelf,
    ledgerVersion,
    relationshipLoading,
    theyStandWithViewer,
    viewerAccountId,
  ]);

  return {
    signals,
    viewerStanding,
    theyStandWithViewer,
    relationshipLoading: isLoading,
  };
}

const EMPTY_DAO_SIGNALS = (standingCount: number) => ({
  standingCount,
  standingWithCount: 0,
  mutualStandingCount: 0,
  endorsementsReceivedCount: 0,
  endorsementsGivenCount: 0,
  postCount: 0,
  reputation: null as ProfileSignals['reputation'],
});

/** Live incoming stand count for DAO gesture chrome. */
export function useLiveIncomingStandingCount(
  accountId: string,
  baseCount: number
): number {
  const { signals } = useLiveProfileSignals(
    accountId,
    EMPTY_DAO_SIGNALS(baseCount)
  );
  return signals.standingCount;
}
