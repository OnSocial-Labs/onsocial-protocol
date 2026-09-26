'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Divider, OsHugSheet } from '@onsocial/ui';
import {
  ProfileSocialListRow,
  ProfileSocialListSkeleton,
} from '@/components/panels/profile-social-list-row';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useViewerEndorsement } from '@/hooks/use-viewer-endorsement';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { getGlobalViewerEndorsementLedger } from '@/lib/viewer-endorsement-global';
import { overlayViewerEndorsedOnAccounts } from '@/lib/viewer-endorsement-ledger';
import { accountIdsEqual } from '@/lib/account-match';
import { loadProfileListAccounts } from '@/lib/load-profile-list-accounts';
import type { ProfileListAccount } from '@/lib/profile-list-account';
import { profileListAccountToStandingSummary } from '@/lib/profile-list-account';
import { SHEET_Z } from '@/lib/sheet-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export type ScarceFansSheetProps = {
  open: boolean;
  onClose: () => void;
  fanIds: string[];
  fanCount: number;
  dropTitle?: string | null;
  /** True while account ids are still loading (e.g. post likes fetch). */
  idsLoading?: boolean;
  /** The id list itself failed, before profile rows load. */
  idsError?: boolean;
  label?: string;
  countSingular?: string;
  countPlural?: string;
  emptyCopy?: string;
  errorCopy?: string;
  closeAriaLabel?: string;
  backdropLabel?: string;
  zIndex?: number;
};

/**
 * Account roster sheet — standing-style rows (skeleton → hydrated stats + Stand).
 * Album fans + post likes share this chrome.
 */
export function ScarceFansSheet({
  open,
  onClose,
  fanIds,
  fanCount,
  dropTitle,
  idsLoading = false,
  idsError = false,
  label = 'Fans',
  countSingular = 'fan',
  countPlural = 'fans',
  emptyCopy = 'No fans yet.',
  errorCopy = 'Couldn’t load fans.',
  closeAriaLabel = 'Close fans',
  backdropLabel = 'Close fans',
  zIndex = SHEET_Z.list,
}: ScarceFansSheetProps) {
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding('scarce-fans');
  const { endorsementSyncVersion } = useViewerEndorsement('scarce-fans');

  const fanIdsKey = fanIds.join('\n');
  const requestKey = open ? `${fanIdsKey}\0${viewerAccountId ?? ''}` : '';
  const [fetched, setFetched] = useState<{
    key: string;
    accounts: ProfileListAccount[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open || idsLoading || fanIds.length === 0) return;
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
  }, [open, requestKey, fanIds, viewerAccountId, idsLoading]);

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
    return n === 1 ? `1 ${countSingular}` : `${n} ${countPlural}`;
  }, [countPlural, countSingular, fanCount, fanIds.length]);

  const accounts = useMemo(() => {
    if (!open || idsLoading || fanIds.length === 0) return [];
    if (fetched?.key !== requestKey) return null;
    return overlayViewerEndorsedOnAccounts(
      fetched.accounts,
      getGlobalViewerEndorsementLedger()
    );
  }, [
    endorsementSyncVersion,
    fanIds.length,
    fetched,
    idsLoading,
    open,
    requestKey,
  ]);
  const loadError =
    Boolean(open) &&
    !idsLoading &&
    (idsError || (fetched?.key === requestKey && fetched.error));
  const showSkeleton =
    open && (idsLoading || (fanIds.length > 0 && accounts === null));
  const skeletonCount = Math.min(
    8,
    Math.max(fanIds.length || fanCount || 1, 1)
  );

  return (
    <OsHugSheet
      open={open}
      onClose={handleClose}
      label={label}
      copy={dropTitle?.trim() || countLabel}
      closeAriaLabel={closeAriaLabel}
      backdropLabel={backdropLabel}
      zIndex={zIndex}
      panelClassName="scarce-fans-sheet-panel os-sheet-cap-standard"
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
        <p className="scarce-fans-empty">{loadError ? errorCopy : emptyCopy}</p>
      )}
    </OsHugSheet>
  );
}
