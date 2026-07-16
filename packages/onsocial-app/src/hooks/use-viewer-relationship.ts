'use client';

import { useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { fetchViewerStandingRelationship } from '@/lib/profile-social-standings';
import { resolveViewerStanding } from '@/lib/viewer-standing-ledger';
import {
  getGlobalViewerStandingLedger,
  subscribeGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';

type ApiRelationshipState = {
  pageAccountId: string;
  viewerAccountId: string;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
};

export function useViewerRelationship(pageAccountId: string) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const [apiRelationship, setApiRelationship] =
    useState<ApiRelationshipState | null>(null);
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const targetAccountId = pageAccountId.trim();
  const isSelf =
    Boolean(viewerAccountId) &&
    Boolean(targetAccountId) &&
    accountIdsEqual(viewerAccountId!, targetAccountId);

  useEffect(() => {
    return subscribeGlobalViewerStandingLedger(() => {
      setLedgerVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => {
    if (!isConnected || !viewerAccountId || isSelf || !targetAccountId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const relationship = await fetchViewerStandingRelationship(
          targetAccountId,
          viewerAccountId
        );
        if (!cancelled) {
          setApiRelationship({
            pageAccountId: targetAccountId,
            viewerAccountId,
            viewerStanding: relationship.viewerStanding,
            theyStandWithViewer: relationship.theyStandWithViewer,
          });
        }
      } catch {
        if (!cancelled) {
          setApiRelationship({
            pageAccountId: targetAccountId,
            viewerAccountId,
            viewerStanding: false,
            theyStandWithViewer: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, isSelf, targetAccountId, viewerAccountId, ledgerVersion]);

  if (!isConnected || !viewerAccountId || isSelf || !targetAccountId) {
    return {
      viewerStanding: false,
      theyStandWithViewer: false,
      isLoading: false,
    };
  }

  const ledger = getGlobalViewerStandingLedger();
  const matchedRelationship =
    apiRelationship?.pageAccountId === targetAccountId &&
    apiRelationship.viewerAccountId === viewerAccountId
      ? apiRelationship
      : null;
  const apiStanding = matchedRelationship?.viewerStanding ?? false;

  return {
    viewerStanding: resolveViewerStanding(
      ledger,
      targetAccountId,
      apiStanding
    ),
    theyStandWithViewer: matchedRelationship?.theyStandWithViewer ?? false,
    isLoading: matchedRelationship == null,
  };
}
