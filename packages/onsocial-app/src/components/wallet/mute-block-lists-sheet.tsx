'use client';

import { useCallback, useMemo, useState } from 'react';
import { OsHugSheet, ProfileAvatar } from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useViewerBlock } from '@/hooks/use-viewer-block';
import { useViewerMute } from '@/hooks/use-viewer-mute';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  BLOCK_LIST_HINT,
  MUTE_LIST_HINT,
} from '@/lib/block-confirm-copy';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { portfolioPath } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface MuteBlockListsSheetProps {
  open: boolean;
  onClose: () => void;
}

type ListKind = 'muted' | 'blocked';

/**
 * Manage muted (off-chain) and blocked (on-chain) accounts.
 */
export function MuteBlockListsSheet({
  open,
  onClose,
}: MuteBlockListsSheetProps) {
  const { setTxResult } = useAppTransactionFeedback();
  const {
    mutedAccountIds,
    updateMute,
    isMutePendingForTarget,
    muteSyncVersion,
  } = useViewerMute();
  const {
    blockedAccountIds,
    updateBlock,
    isBlockPendingForTarget,
    blockSyncVersion,
  } = useViewerBlock();
  const [closing, setClosing] = useState(false);
  const [kind, setKind] = useState<ListKind>('muted');
  const [rowMenuAccountId, setRowMenuAccountId] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const handleClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const accounts = useMemo(() => {
    void muteSyncVersion;
    void blockSyncVersion;
    return kind === 'muted' ? mutedAccountIds : blockedAccountIds;
  }, [
    blockedAccountIds,
    blockSyncVersion,
    kind,
    muteSyncVersion,
    mutedAccountIds,
  ]);

  const profiles = usePostAuthorProfiles(accounts);

  const rowItems = useMemo<ActionDrawerItem[]>(() => {
    if (!rowMenuAccountId) return [];
    if (kind === 'muted') {
      return [
        {
          id: 'unmute',
          label: isMutePendingForTarget(rowMenuAccountId)
            ? 'Unmuting…'
            : 'Unmute',
          disabled: isMutePendingForTarget(rowMenuAccountId),
          onSelect: () => {
            void (async () => {
              try {
                await updateMute(rowMenuAccountId, false);
                setTxResult({
                  type: 'success',
                  msg: txToastSuccess.accountUnmuted,
                });
              } catch (error) {
                if (isWalletUserCancellation(error)) return;
                setTxResult({
                  type: 'error',
                  msg:
                    error instanceof Error
                      ? error.message
                      : txToastError.unmuteAccountFailed,
                });
              } finally {
                setRowMenuAccountId(null);
              }
            })();
          },
        },
        {
          id: 'view',
          label: 'View profile',
          href: portfolioPath(rowMenuAccountId),
          onSelect: () => setRowMenuAccountId(null),
        },
      ];
    }
    return [
      {
        id: 'unblock',
        label: isBlockPendingForTarget(rowMenuAccountId)
          ? 'Unblocking…'
          : 'Unblock',
        disabled: isBlockPendingForTarget(rowMenuAccountId),
        onSelect: () => {
          void (async () => {
            try {
              await updateBlock(rowMenuAccountId, false);
            } catch (error) {
              if (isWalletUserCancellation(error)) return;
              setTxResult({
                type: 'error',
                msg:
                  error instanceof Error
                    ? error.message
                    : txToastError.unblockAccountFailed,
              });
            } finally {
              setRowMenuAccountId(null);
            }
          })();
        },
      },
      {
        id: 'view',
        label: 'View profile',
        href: portfolioPath(rowMenuAccountId),
        onSelect: () => setRowMenuAccountId(null),
      },
    ];
  }, [
    isBlockPendingForTarget,
    isMutePendingForTarget,
    kind,
    rowMenuAccountId,
    setTxResult,
    updateBlock,
    updateMute,
  ]);

  const rowMenuLabel = rowMenuAccountId
    ? displayName(
        rowMenuAccountId,
        profiles[rowMenuAccountId]?.displayName
      )
    : 'Account';

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={handleClose}
        onClosed={handleClosed}
        label="Muted & blocked"
        closeAriaLabel="Close muted and blocked"
        backdropLabel="Close muted and blocked"
        zIndex={SHEET_Z.list}
        sizing="full"
        titleId="mute-block-lists-title"
      >
        <div className="mute-block-lists-tabs" role="tablist" aria-label="List">
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'muted'}
            className={`mute-block-lists-tab${kind === 'muted' ? ' is-active' : ''}`}
            onClick={() => setKind('muted')}
          >
            Muted
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'blocked'}
            className={`mute-block-lists-tab${kind === 'blocked' ? ' is-active' : ''}`}
            onClick={() => setKind('blocked')}
          >
            Blocked
          </button>
        </div>
        <p className="mute-block-lists-hint">
          {kind === 'muted' ? MUTE_LIST_HINT : BLOCK_LIST_HINT}
        </p>
        {accounts.length === 0 ? (
          <p className="mute-block-lists-empty">
            {kind === 'muted' ? 'No muted accounts.' : 'No blocked accounts.'}
          </p>
        ) : (
          <ul
            className="mute-block-lists-rows"
            aria-label={
              kind === 'muted' ? 'Muted accounts' : 'Blocked accounts'
            }
          >
            {accounts.map((accountId) => {
              const profile = profiles[accountId];
              const name = displayName(accountId, profile?.displayName);
              const handle = fallbackLabel(accountId);
              return (
                <li key={accountId}>
                  <button
                    type="button"
                    className="mute-block-lists-row"
                    onClick={() => setRowMenuAccountId(accountId)}
                  >
                    <ProfileAvatar
                      src={profile?.avatarUrl ?? undefined}
                      fallbackInitial={name.slice(0, 1)}
                      size="sm"
                    />
                    <span className="mute-block-lists-row-copy">
                      <span className="mute-block-lists-row-label">{name}</span>
                      {name !== handle ? (
                        <span className="mute-block-lists-row-handle">
                          @{handle}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </OsHugSheet>
      <ActionDrawer
        open={Boolean(rowMenuAccountId)}
        onClose={() => setRowMenuAccountId(null)}
        label={rowMenuLabel}
        items={rowItems}
      />
    </>
  );
}
