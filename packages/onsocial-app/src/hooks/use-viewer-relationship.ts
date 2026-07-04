'use client';

import { useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
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

  useEffect(() => {
    return subscribeGlobalViewerStandingLedger(() => {
      setLedgerVersion((version) => version + 1);
    });
  }, []);

  useEffect(() => {
    if (!isConnected || !viewerAccountId || viewerAccountId === pageAccountId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const relationship = await fetchViewerStandingRelationship(
          pageAccountId,
          viewerAccountId
        );
        if (!cancelled) {
          setApiRelationship({
            pageAccountId,
            viewerAccountId,
            viewerStanding: relationship.viewerStanding,
            theyStandWithViewer: relationship.theyStandWithViewer,
          });
        }
      } catch {
        if (!cancelled) {
          setApiRelationship({
            pageAccountId,
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
  }, [isConnected, pageAccountId, viewerAccountId, ledgerVersion]);

  if (!isConnected || !viewerAccountId || viewerAccountId === pageAccountId) {
    return {
      viewerStanding: false,
      theyStandWithViewer: false,
      isLoading: false,
    };
  }

  const ledger = getGlobalViewerStandingLedger();
  const matchedRelationship =
    apiRelationship?.pageAccountId === pageAccountId &&
    apiRelationship.viewerAccountId === viewerAccountId
      ? apiRelationship
      : null;
  const apiStanding = matchedRelationship?.viewerStanding ?? false;

  return {
    viewerStanding: resolveViewerStanding(
      ledger,
      pageAccountId,
      apiStanding
    ),
    theyStandWithViewer: matchedRelationship?.theyStandWithViewer ?? false,
    isLoading: matchedRelationship == null,
  };
}
