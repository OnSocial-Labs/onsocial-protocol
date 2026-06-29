'use client';

import { useCallback, useRef, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { APP_SOCIAL_SESSION_MISSING_MESSAGE } from '@/lib/app-social-session';
import type {
  StandingAccountSummary,
  StanceDetailKind,
} from '@/lib/profile-social-standings';
import {
  deriveStandingAccountsList,
  recordViewerStanding,
  reconcileStandingListFromApi,
  shouldFreshFetchStandingList,
  type StandingListSnapshot,
} from '@/lib/viewer-standing-ledger';
import {
  bumpGlobalViewerStandingLedger,
  getGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function useViewerStanding(listAccountId: string) {
  const {
    isConnected,
    hasSocialSession,
    accountId: viewerAccountId,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const ledgerRef = useRef(getGlobalViewerStandingLedger());
  const pendingRef = useRef<Set<string>>(new Set());
  const [standingSyncVersion, setStandingSyncVersion] = useState(0);

  const bumpStandingSync = useCallback(() => {
    bumpGlobalViewerStandingLedger();
    setStandingSyncVersion((version) => version + 1);
  }, []);

  const isStandingPendingForTarget = useCallback((targetAccountId: string) => {
    return pendingRef.current.has(targetAccountId);
  }, []);

  const deriveStandingListAccounts = useCallback(
    (
      accounts: StandingAccountSummary[],
      kind: StanceDetailKind,
      viewerAccountId: string | null
    ) =>
      deriveStandingAccountsList({
        accounts,
        ledger: ledgerRef.current,
        kind,
        listAccountId,
        viewerAccountId,
      }),
    [listAccountId]
  );

  const reconcileStandingListFromFetch = useCallback(
    (accounts: StandingAccountSummary[]) => {
      if (reconcileStandingListFromApi(ledgerRef.current, accounts)) {
        bumpStandingSync();
      }
    },
    [bumpStandingSync]
  );

  const shouldFreshFetchStandingListFor = useCallback(
    (
      accountId: string,
      viewerAccountId: string | null,
      kind: StanceDetailKind
    ) =>
      shouldFreshFetchStandingList(
        ledgerRef.current,
        accountId,
        viewerAccountId,
        kind
      ),
    []
  );

  const updateStanding = useCallback(
    async (
      targetAccount: StandingAccountSummary,
      shouldStand: boolean
    ): Promise<void> => {
      if (!isConnected) {
        throw new Error('Connect your wallet before updating standing.');
      }

      if (viewerAccountId === targetAccount.accountId) {
        throw new Error('You cannot stand with your own account.');
      }

      if (pendingRef.current.has(targetAccount.accountId)) {
        return;
      }

      pendingRef.current.add(targetAccount.accountId);
      bumpStandingSync();

      const { client, session } = await getClient();
      if (!session) {
        throw new Error(APP_SOCIAL_SESSION_MISSING_MESSAGE);
      }

      const snapshot: StandingListSnapshot = {
        accountId: targetAccount.accountId,
        name: targetAccount.name,
        avatarUrl: targetAccount.avatarUrl,
        bio: targetAccount.bio ?? null,
      };

      try {
        if (shouldStand) {
          await client.standings.add(targetAccount.accountId, { wait: true });
        } else {
          await client.standings.remove(targetAccount.accountId, { wait: true });
        }

        recordViewerStanding(
          ledgerRef.current,
          targetAccount.accountId,
          shouldStand,
          shouldStand ? snapshot : undefined
        );
        bumpStandingSync();
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          throw error;
        }
      } finally {
        pendingRef.current.delete(targetAccount.accountId);
        bumpStandingSync();
      }
    },
    [bumpStandingSync, getClient, isConnected, viewerAccountId]
  );

  return {
    hasSocialSession,
    isConnected,
    standingSyncVersion,
    deriveStandingListAccounts,
    reconcileStandingListFromFetch,
    shouldFreshFetchStandingListFor,
    isStandingPendingForTarget,
    updateStanding,
  };
}
