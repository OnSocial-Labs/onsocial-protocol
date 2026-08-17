'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Divider, OsHugSheet } from '@onsocial/ui';
import {
  ProfileSocialListRow,
  ProfileSocialListSkeleton,
} from '@/components/panels/profile-social-list-row';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { accountIdsEqual } from '@/lib/account-match';
import { loadProfileListAccounts } from '@/lib/load-profile-list-accounts';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { profileListAccountToStandingSummary } from '@/lib/profile-list-account';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/**
 * Album fans roster — standing-style rows (skeleton → hydrated stats + Stand).
 */
export function ScarceFansSheet({
  open,
  onClose,
  fanIds,
  fanCount,
  dropTitle,
}: {
  open: boolean;
  onClose: () => void;
  fanIds: string[];
  fanCount: number;
  dropTitle?: string | null;
}) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('scarce-fans');

  const fanIdsKey = fanIds.join('\n');
  const requestKey = open
    ? `${fanIdsKey}\0${viewerAccountId ?? ''}`
    : '';
  const [fetched, setFetched] = useState<{
    key: string;
    accounts: ProfileListAccount[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open || fanIds.length === 0) return;
    const key = requestKey;
    let cancelled = false;

    void loadProfileListAccounts(fanIds, viewerAccountId ?? null)
      .then((accounts) => {
        if (cancelled) return;
        setFetched({ key, accounts, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setFetched({ key, accounts: [], error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [open, requestKey, fanIds, viewerAccountId]);

  const handleClose = useCallback(() => {
    setFetched(null);
    onClose();
  }, [onClose]);

  const handleUpdateStanding = useCallback(
    async (account: ProfileListAccount, shouldStand: boolean) => {
      try {
        await updateStanding(
          profileListAccountToStandingSummary(account),
          shouldStand
        );
        setFetched((current) =>
          current
            ? {
                ...current,
                accounts: current.accounts.map((row) =>
                  accountIdsEqual(row.accountId, account.accountId)
                    ? { ...row, viewerStanding: shouldStand }
                    : row
                ),
              }
            : current
        );
      } catch (cause) {
        if (!isWalletUserCancellation(cause)) {
          setTxResult({
            type: 'error',
            msg:
              cause instanceof Error
                ? cause.message
                : 'Couldn’t update standing.',
          });
        }
      }
    },
    [setTxResult, updateStanding]
  );

  const countLabel = useMemo(() => {
    const n = Math.max(fanCount, fanIds.length);
    return n === 1 ? '1 fan' : `${n} fans`;
  }, [fanCount, fanIds.length]);

  const accounts =
    !open || fanIds.length === 0
      ? []
      : fetched?.key === requestKey
        ? fetched.accounts
        : null;
  const loadError =
    Boolean(open) && fetched?.key === requestKey && fetched.error;
  const showSkeleton = open && fanIds.length > 0 && accounts === null;
  const skeletonCount = Math.min(8, Math.max(fanIds.length || fanCount, 1));

  return (
    <OsHugSheet
      open={open}
      onClose={handleClose}
      label="Fans"
      copy={dropTitle?.trim() || countLabel}
      closeAriaLabel="Close fans"
      backdropLabel="Close fans"
      zIndex={58}
      panelClassName="scarce-fans-sheet-panel"
      bodyClassName="scarce-fans-sheet-body"
    >
      {showSkeleton ? (
        <ProfileSocialListSkeleton count={skeletonCount} />
      ) : accounts && accounts.length > 0 ? (
        <div className="standing-list scarce-fans-standing">
          {accounts.map((account, index) => {
            const isSelf =
              Boolean(viewerAccountId) &&
              accountIdsEqual(viewerAccountId!, account.accountId);
            return (
              <div key={account.accountId}>
                {index > 0 ? <Divider variant="item" /> : null}
                <ProfileSocialListRow
                  account={account}
                  standingTimeMode="never"
                  viewerAccountId={viewerAccountId}
                  canUpdateStanding={isConnected && !isSelf}
                  isPending={isStandingPendingForTarget(account.accountId)}
                  onUpdateStanding={(shouldStand) => {
                    void handleUpdateStanding(account, shouldStand);
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="scarce-fans-empty">
          {loadError ? 'Couldn’t load fans.' : 'No fans yet.'}
        </p>
      )}
    </OsHugSheet>
  );
}
