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

/** Portfolio face metrics — ledger-adjusted until indexer catches up. */
export function useLiveProfileSignals(
  accountId: string,
  baseSignals: ProfileSignals
) {
  const { accountId: viewerAccountId } = useAppWallet();
  const {
    apiViewerStanding,
    theyStandWithViewer,
    isLoading: relationshipLoading,
    viewerStanding,
    isLoading,
  } = useViewerRelationship(accountId);
  const [ledgerVersion, setLedgerVersion] = useState(
    getGlobalViewerStandingLedgerVersion
  );

  useEffect(() => {
    return subscribeGlobalViewerStandingLedger(() => {
      setLedgerVersion(getGlobalViewerStandingLedgerVersion());
    });
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

    return {
      ...baseSignals,
      standingCount: adjusted.incoming,
      standingWithCount: adjusted.outgoing,
      mutualStandingCount: adjusted.mutual,
    };
  }, [
    accountId,
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
