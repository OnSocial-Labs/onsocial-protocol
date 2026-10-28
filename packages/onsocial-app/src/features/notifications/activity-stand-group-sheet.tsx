'use client';

import { useCallback, useEffect, useState } from 'react';
import { Divider, OsHugSheet } from '@onsocial/ui';
import type { Notification } from '@onsocial/sdk';
import { ProfileSocialListRow } from '@/components/panels/profile-social-list-row';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { formatDmDaySeparator } from '@/features/messages/dm-time';
import { accountIdsEqual } from '@/lib/account-match';
import { formatNotificationTime } from '@/lib/notification-display';
import { loadProfileListAccounts } from '@/lib/load-profile-list-accounts';
import {
  profileListAccountToStandingSummary,
  type ProfileListAccount,
} from '@/lib/profile-list-account';
import { SHEET_Z } from '@/lib/sheet-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function fallbackAccount(accountId: string): ProfileListAccount {
  return {
    accountId,
    name: null,
    avatarUrl: null,
    standingCount: 0,
    standingWithCount: 0,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    viewerStanding: false,
    theyStandWithViewer: false,
    targetEndorsedViewer: false,
    viewerEndorsed: false,
    rowHydrated: true,
  };
}

/**
 * Who stood the same day. Same person row as fans and likes.
 * A single stand never reaches this sheet.
 */
export function ActivityStandGroupSheet({
  items,
  onClose,
}: {
  items: Notification[] | null;
  onClose: () => void;
}) {
  const people = (items ?? []).filter((item) => item.actor?.trim());
  const day = people[0] ? formatDmDaySeparator(people[0].createdAt) : '';
  const open = people.length > 1;
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { updateStanding, isStandingPendingForTarget } = useViewerStanding(
    'activity-stand-group'
  );
  const idsKey = people.map((item) => item.actor?.trim() ?? '').join('\n');
  const [hydrated, setHydrated] = useState<Record<
    string,
    ProfileListAccount
  > | null>(null);

  useEffect(() => {
    if (!open) return;
    const ids = idsKey.split('\n').filter(Boolean);
    let cancelled = false;
    void loadProfileListAccounts(ids, viewerAccountId ?? null)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, ProfileListAccount> = {};
        for (const row of rows) next[row.accountId] = row;
        setHydrated(next);
      })
      .catch(() => {
        if (!cancelled) setHydrated({});
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, open, viewerAccountId]);

  const handleUpdateStanding = useCallback(
    async (account: ProfileListAccount, shouldStand: boolean) => {
      try {
        await updateStanding(
          profileListAccountToStandingSummary(account),
          shouldStand
        );
        setHydrated((current) =>
          current
            ? {
                ...current,
                [account.accountId]: {
                  ...(current[account.accountId] ?? account),
                  viewerStanding: shouldStand,
                },
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

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label="Stood with you"
      {...(day ? { copy: day } : {})}
      closeAriaLabel="Close stands"
      backdropLabel="Close stands"
      zIndex={SHEET_Z.list}
      panelClassName="scarce-fans-sheet-panel os-sheet-cap-standard"
    >
      <div
        className="standing-list scarce-fans-standing"
        role="list"
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest('a.standing-row-hit')) onClose();
        }}
      >
        {people.map((item, index) => {
          const accountId = item.actor?.trim() ?? '';
          const account = hydrated?.[accountId] ?? fallbackAccount(accountId);
          const when = formatNotificationTime(item.createdAt);
          const isSelf =
            Boolean(viewerAccountId) &&
            accountIdsEqual(viewerAccountId!, accountId);
          return (
            <div key={item.id} role="listitem">
              {index > 0 ? <Divider variant="item" /> : null}
              <ProfileSocialListRow
                account={account}
                density="person"
                standingTimeMode="never"
                asideTime={
                  when.label
                    ? {
                        label: when.label,
                        description: when.title || when.label,
                      }
                    : null
                }
                viewerAccountId={viewerAccountId ?? null}
                canUpdateStanding={isConnected && !isSelf}
                isPending={isStandingPendingForTarget(accountId)}
                onUpdateStanding={(shouldStand) => {
                  void handleUpdateStanding(account, shouldStand);
                }}
              />
            </div>
          );
        })}
      </div>
    </OsHugSheet>
  );
}
