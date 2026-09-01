'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  creditAppPlatformReward,
  creditAppPlatformSocialReward,
} from '@/lib/app-platform-rewards';
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
  getGlobalViewerStandingLedgerVersion,
  isGlobalStandingPending,
  setGlobalStandingPending,
  subscribeGlobalViewerStandingLedger,
} from '@/lib/viewer-standing-global';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function useViewerStanding(listAccountId: string) {
  const {
    isConnected,
    hasSocialSession,
    accountId: viewerAccountId,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const ledgerRef = useRef(getGlobalViewerStandingLedger());
  const [standingSyncVersion, setStandingSyncVersion] = useState(
    getGlobalViewerStandingLedgerVersion
  );

  useEffect(() => {
    return subscribeGlobalViewerStandingLedger(() => {
      setStandingSyncVersion(getGlobalViewerStandingLedgerVersion());
    });
  }, []);

  const bumpStandingSync = useCallback(() => {
    bumpGlobalViewerStandingLedger();
  }, []);

  const isStandingPendingForTarget = useCallback((targetAccountId: string) => {
    return isGlobalStandingPending(targetAccountId);
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

      if (shouldStand && isBlockEitherWay(targetAccount.accountId)) {
        throw new Error('Standing is unavailable while a block is in place.');
      }

      if (isGlobalStandingPending(targetAccount.accountId)) {
        return;
      }

      setGlobalStandingPending(targetAccount.accountId, true);

      try {
        const { client, session } = await getClient();

        const snapshot: StandingListSnapshot = {
          accountId: targetAccount.accountId,
          name: targetAccount.name,
          avatarUrl: targetAccount.avatarUrl,
          bio: targetAccount.bio ?? null,
          isDao: targetAccount.isDao,
        };

        if (shouldStand) {
          const response = await client.standings.add(targetAccount.accountId, {
            wait: true,
          });
          if (viewerAccountId && session) {
            const proof = { txHash: response.txHash ?? '' };
            creditAppPlatformSocialReward({
              accountId: viewerAccountId,
              action: 'stand_given',
              targetAccountId: targetAccount.accountId,
              targetDisplayName: targetAccount.name,
              proof,
              session,
            });
            creditAppPlatformReward({
              accountId: viewerAccountId,
              action: 'mutual_stand_created',
              targetAccountId: targetAccount.accountId,
              targetDisplayName: targetAccount.name,
              proof,
              session,
            });
          }
        } else {
          await client.standings.remove(targetAccount.accountId, {
            wait: true,
          });
        }

        recordViewerStanding(
          ledgerRef.current,
          targetAccount.accountId,
          shouldStand,
          shouldStand ? snapshot : undefined,
          Boolean(targetAccount.theyStandWithViewer)
        );
        bumpStandingSync();
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          throw error;
        }
      } finally {
        setGlobalStandingPending(targetAccount.accountId, false);
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
