'use client';

import { useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { fetchViewerStandingRelationship } from '@/lib/profile-social-standings';
import { resolveViewerStanding } from '@/lib/viewer-standing-ledger';
import {
  getGlobalViewerStandingLedger,
  subscribeGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';

export function useViewerRelationship(pageAccountId: string) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const [apiRelationship, setApiRelationship] = useState<{
    viewerStanding: boolean;
    theyStandWithViewer: boolean;
  } | null>(null);
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
          setApiRelationship(relationship);
        }
      } catch {
        if (!cancelled) {
          setApiRelationship(null);
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
    };
  }

  const ledger = getGlobalViewerStandingLedger();
  const apiStanding = apiRelationship?.viewerStanding ?? false;

  return {
    viewerStanding: resolveViewerStanding(
      ledger,
      pageAccountId,
      apiStanding
    ),
    theyStandWithViewer: apiRelationship?.theyStandWithViewer ?? false,
  };
}
