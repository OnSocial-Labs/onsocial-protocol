'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EndorsementPanelItem,
  EndorsementsMode,
} from '@/lib/endorsements-panel-data';
import {
  deriveEndorsementListItems,
  recordViewerEndorse,
  recordViewerEndorseRemove,
  reconcileEndorsementListFromApi,
  shouldFreshFetchEndorsementList,
  type EndorsementListSnapshot,
  type ViewerEndorsementDraft,
} from '@/lib/viewer-endorsement-ledger';
import {
  bumpGlobalViewerEndorsementLedger,
  getGlobalViewerEndorsementLedger,
  getGlobalViewerEndorsementLedgerVersion,
  isGlobalEndorsePending,
  setGlobalEndorsePending,
  subscribeGlobalViewerEndorsementLedger,
} from '@/lib/viewer-endorsement-global';

export function useViewerEndorsement(listAccountId: string) {
  const ledgerRef = useRef(getGlobalViewerEndorsementLedger());
  const [endorsementSyncVersion, setEndorsementSyncVersion] = useState(
    getGlobalViewerEndorsementLedgerVersion
  );

  useEffect(() => {
    return subscribeGlobalViewerEndorsementLedger(() => {
      setEndorsementSyncVersion(getGlobalViewerEndorsementLedgerVersion());
    });
  }, []);

  const bumpEndorsementSync = useCallback(() => {
    bumpGlobalViewerEndorsementLedger();
  }, []);

  const isEndorsePendingForTarget = useCallback((targetAccountId: string) => {
    return isGlobalEndorsePending(targetAccountId);
  }, []);

  const setEndorsePendingForTarget = useCallback(
    (targetAccountId: string, pending: boolean) => {
      setGlobalEndorsePending(targetAccountId, pending);
    },
    []
  );

  const deriveEndorsementItems = useCallback(
    (
      items: EndorsementPanelItem[],
      mode: EndorsementsMode,
      viewerAccountId: string | null
    ) =>
      deriveEndorsementListItems({
        items,
        ledger: ledgerRef.current,
        mode,
        listAccountId,
        viewerAccountId,
      }),
    [listAccountId]
  );

  const reconcileEndorsementListFromFetch = useCallback(
    (
      items: Array<{ issuer: string; target: string; topic?: string | null }>,
      viewerAccountId: string | null
    ) => {
      if (
        reconcileEndorsementListFromApi(
          ledgerRef.current,
          items,
          viewerAccountId
        )
      ) {
        bumpEndorsementSync();
      }
    },
    [bumpEndorsementSync]
  );

  const shouldFreshFetchEndorsementListFor = useCallback(
    (
      accountId: string,
      viewerAccountId: string | null,
      mode: EndorsementsMode
    ) =>
      shouldFreshFetchEndorsementList(
        ledgerRef.current,
        accountId,
        viewerAccountId,
        mode
      ),
    []
  );

  const confirmEndorse = useCallback(
    (
      targetAccountId: string,
      topic?: string | null,
      options?: {
        previousTopic?: string | null;
        snapshot?: EndorsementListSnapshot;
        draft?: ViewerEndorsementDraft;
      }
    ) => {
      recordViewerEndorse(ledgerRef.current, targetAccountId, topic, options);
      bumpEndorsementSync();
    },
    [bumpEndorsementSync]
  );

  const confirmEndorseRemove = useCallback(
    (targetAccountId: string, topic?: string | null) => {
      recordViewerEndorseRemove(ledgerRef.current, targetAccountId, topic);
      bumpEndorsementSync();
    },
    [bumpEndorsementSync]
  );

  return {
    endorsementSyncVersion,
    isEndorsePendingForTarget,
    setEndorsePendingForTarget,
    deriveEndorsementItems,
    reconcileEndorsementListFromFetch,
    shouldFreshFetchEndorsementListFor,
    confirmEndorse,
    confirmEndorseRemove,
  };
}
