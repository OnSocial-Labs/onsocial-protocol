'use client';

import { useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { fetchViewerStandingRelationship } from '@/lib/profile-social-standings';
import { resolveViewerStanding } from '@/lib/viewer-standing-ledger';
import {
  getGlobalViewerStandingLedger,
  getGlobalViewerStandingLedgerVersion,
  subscribeGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';
import {
  reconcileViewerEndorsement,
  resolveViewerEndorsed,
} from '@/lib/viewer-endorsement-ledger';
import {
  bumpGlobalViewerEndorsementLedger,
  getGlobalViewerEndorsementLedger,
  getGlobalViewerEndorsementLedgerVersion,
  subscribeGlobalViewerEndorsementLedger,
} from '@/lib/viewer-endorsement-global';

type ApiRelationshipState = {
  pageAccountId: string;
  viewerAccountId: string;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  viewerEndorsed: boolean;
  viewerEndorsementTopics: string[];
};

export function useViewerRelationship(pageAccountId: string) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const [apiRelationship, setApiRelationship] =
    useState<ApiRelationshipState | null>(null);
  const [ledgerVersion, setLedgerVersion] = useState(
    () =>
      getGlobalViewerStandingLedgerVersion() +
      getGlobalViewerEndorsementLedgerVersion()
  );
  const targetAccountId = pageAccountId.trim();
  const isSelf =
    Boolean(viewerAccountId) &&
    Boolean(targetAccountId) &&
    accountIdsEqual(viewerAccountId!, targetAccountId);

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
        if (cancelled) return;
        const ledger = getGlobalViewerEndorsementLedger();
        if (
          reconcileViewerEndorsement(
            ledger,
            targetAccountId,
            relationship.viewerEndorsementTopics
          )
        ) {
          bumpGlobalViewerEndorsementLedger();
        }
        setApiRelationship({
          pageAccountId: targetAccountId,
          viewerAccountId,
          viewerStanding: relationship.viewerStanding,
          theyStandWithViewer: relationship.theyStandWithViewer,
          viewerEndorsed: relationship.viewerEndorsed,
          viewerEndorsementTopics: relationship.viewerEndorsementTopics,
        });
      } catch {
        if (!cancelled) {
          setApiRelationship({
            pageAccountId: targetAccountId,
            viewerAccountId,
            viewerStanding: false,
            theyStandWithViewer: false,
            viewerEndorsed: false,
            viewerEndorsementTopics: [],
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, isSelf, targetAccountId, viewerAccountId]);

  if (!isConnected || !viewerAccountId || isSelf || !targetAccountId) {
    return {
      viewerStanding: false,
      apiViewerStanding: false,
      theyStandWithViewer: false,
      viewerEndorsed: false,
      apiViewerEndorsed: false,
      apiViewerEndorsementTopics: [] as string[],
      isLoading: false,
    };
  }

  void ledgerVersion;
  const standingLedger = getGlobalViewerStandingLedger();
  const endorsementLedger = getGlobalViewerEndorsementLedger();
  const matchedRelationship =
    apiRelationship?.pageAccountId === targetAccountId &&
    apiRelationship.viewerAccountId === viewerAccountId
      ? apiRelationship
      : null;
  const apiStanding = matchedRelationship?.viewerStanding ?? false;
  const apiEndorsed = matchedRelationship?.viewerEndorsed ?? false;

  return {
    viewerStanding: resolveViewerStanding(
      standingLedger,
      targetAccountId,
      apiStanding
    ),
    apiViewerStanding: apiStanding,
    theyStandWithViewer: matchedRelationship?.theyStandWithViewer ?? false,
    viewerEndorsed: resolveViewerEndorsed(
      endorsementLedger,
      targetAccountId,
      apiEndorsed
    ),
    apiViewerEndorsed: apiEndorsed,
    apiViewerEndorsementTopics:
      matchedRelationship?.viewerEndorsementTopics ?? [],
    isLoading: matchedRelationship == null,
  };
}
