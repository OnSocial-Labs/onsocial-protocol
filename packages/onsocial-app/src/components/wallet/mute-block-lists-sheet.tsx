'use client';

import { useCallback, useMemo, useState } from 'react';
import { GlassSheet, ProfileAvatar, SheetHeader } from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useViewerBlock } from '@/hooks/use-viewer-block';
import { useViewerMute } from '@/hooks/use-viewer-mute';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { fallbackLabel } from '@/lib/profile-display';
import { portfolioPath } from '@/lib/overlay-routes';
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
  useScrollLock(sheetOpen);

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

  return (
    <>
      <GlassSheet
        open={sheetOpen}
        onClose={handleClose}
        onClosed={handleClosed}
        tone="os"
        initialDetent="full"
        zIndex={58}
        presentation="swap"
        ariaLabelledBy="mute-block-lists-title"
        backdropLabel="Close muted and blocked"
      >
        <SheetHeader
          titleId="mute-block-lists-title"
          title="Muted & blocked"
          onClose={handleClose}
          closeAriaLabel="Close muted and blocked"
        />
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
            {accounts.map((accountId) => (
              <li key={accountId}>
                <button
                  type="button"
                  className="mute-block-lists-row"
                  onClick={() => setRowMenuAccountId(accountId)}
                >
                  <ProfileAvatar
                    fallbackInitial={fallbackLabel(accountId).slice(0, 1)}
                    size="sm"
                  />
                  <span className="mute-block-lists-row-label">
                    {fallbackLabel(accountId)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassSheet>
      <ActionDrawer
        open={Boolean(rowMenuAccountId)}
        onClose={() => setRowMenuAccountId(null)}
        label={rowMenuAccountId ? fallbackLabel(rowMenuAccountId) : 'Account'}
        items={rowItems}
      />
    </>
  );
}
