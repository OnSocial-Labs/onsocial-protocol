'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  CopyIcon,
  DotsVerticalIcon,
  KeyIcon,
  OsActionDrawerConfirm,
  ShieldCheckIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { executeHubRosterAction } from '@/features/scarces/execute-hub-roster-action';
import {
  hubRosterActionConfirmCopy,
  hubRosterRowActions,
  type HubRosterManageContext,
  type HubRosterRowAction,
  type HubRosterRowActionId,
} from '@/features/scarces/hub-roster-row-actions';
import type { HubRosterRow } from '@/features/scarces/hub-roster';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { hubRosterTransactionToastForAction } from '@/features/scarces/hub-roster-transaction-toast';

function actionIcon(id: HubRosterRowActionId) {
  if (id === 'copy-handle') {
    return <CopyIcon className="os-action-drawer-icon" aria-hidden />;
  }
  if (id === 'transfer-ownership') {
    return <KeyIcon className="os-action-drawer-icon" aria-hidden />;
  }
  if (id === 'make-moderator') {
    return <ShieldCheckIcon className="os-action-drawer-icon" aria-hidden />;
  }
  if (id === 'make-creator') {
    return <UserPlusIcon className="os-action-drawer-icon" aria-hidden />;
  }
  return <UserMinusIcon className="os-action-drawer-icon" aria-hidden />;
}

interface HubRosterRowMenuProps {
  appId: string;
  row: HubRosterRow;
  manageContext: HubRosterManageContext;
  memberLabel?: string | null;
  onActionComplete?: (input: {
    accountId: string;
    actionId: HubRosterRowActionId;
  }) => void;
  onRequestTransfer?: (accountId: string) => void;
}

export function HubRosterRowMenu({
  appId,
  row,
  manageContext,
  memberLabel,
  onActionComplete,
  onRequestTransfer,
}: HubRosterRowMenuProps) {
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<HubRosterRowAction | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const actions = hubRosterRowActions(row, manageContext);
  const handle = fallbackLabel(row.accountId);
  const spoken = displayName(row.accountId, memberLabel);
  const menuLabel = `Manage ${spoken}`;
  const whoLabel = `${spoken} · @${handle}`;

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  const resetConfirm = useCallback(() => {
    if (pending) return;
    setConfirmAction(null);
  }, [pending]);

  const handleMenuAction = useCallback(
    async (action: HubRosterRowAction) => {
      if (action.id === 'copy-handle') {
        try {
          await navigator.clipboard.writeText(`@${row.accountId}`);
          setCopyError(null);
        } catch {
          setCopyError('Could not copy handle.');
        }
        requestClose();
        return;
      }
      if (action.id === 'transfer-ownership') {
        onRequestTransfer?.(row.accountId);
        requestClose();
        return;
      }
      setCopyError(null);
      setConfirmAction(action);
    },
    [onRequestTransfer, requestClose, row.accountId]
  );

  const handleConfirm = useCallback(async () => {
    if (!confirmAction || pending) return;

    setPending(true);
    try {
      // Scarces hub roster needs wallet broadcast + 1 yocto — not the core
      // FunctionCall session (receiver is core.onsocial.*, cannot attach NEAR).
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const { txHashes } = await executeHubRosterAction(client, {
        appId,
        accountId: row.accountId,
        actionId: confirmAction.id,
      });
      const toast = hubRosterTransactionToastForAction(confirmAction.id);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: toast.confirming,
        successMessage: toast.success,
        failureMessage: toast.failure,
      });
      if (confirmed) {
        onActionComplete?.({
          accountId: row.accountId,
          actionId: confirmAction.id,
        });
        setConfirmAction(null);
        setClosing(false);
        setOpen(false);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error && cause.message.trim()
            ? cause.message
            : hubRosterTransactionToastForAction(confirmAction.id).failure,
      });
    } finally {
      setPending(false);
    }
  }, [
    appId,
    confirmAction,
    getSigningWallet,
    onActionComplete,
    pending,
    row.accountId,
    setTxResult,
    trackTransaction,
  ]);

  const menuItems = useMemo<ActionDrawerItem[]>(
    () =>
      actions.map((action) => ({
        id: action.id,
        label: action.label,
        destructive: action.destructive,
        leading: actionIcon(action.id),
        onSelect: () => void handleMenuAction(action),
      })),
    [actions, handleMenuAction]
  );

  if (actions.length === 0) return null;

  const confirmCopy = confirmAction
    ? hubRosterActionConfirmCopy(confirmAction, manageContext)
    : null;

  return (
    <div
      className={`drops-discovery-row-menu post-card-menu guild-member-row-menu${
        sheetOpen ? ' is-open' : ''
      }`}
    >
      <button
        type="button"
        className={`post-card-menu-trigger${sheetOpen ? ' is-open' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={menuLabel}
        disabled={pending}
      >
        <DotsVerticalIcon className="post-card-menu-icon" aria-hidden />
      </button>

      <ActionDrawer
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label={menuLabel}
        copy={whoLabel}
        listAriaLabel={menuLabel}
        closeAriaLabel="Close menu"
        items={menuItems}
      />
      <ActionDrawer
        open={confirmAction != null && confirmCopy != null}
        stack="auto"
        onClose={resetConfirm}
        label={confirmCopy?.title ?? menuLabel}
        copy={whoLabel}
        closeAriaLabel="Close"
      >
        {confirmAction && confirmCopy ? (
          <OsActionDrawerConfirm
            body={confirmCopy.subtitle}
            confirmLabel={confirmCopy.confirmLabel}
            pending={pending}
            pendingLabel="Updating…"
            onConfirm={() => void handleConfirm()}
            onCancel={resetConfirm}
          />
        ) : null}
      </ActionDrawer>

      {copyError ? (
        <p className="guild-member-row-menu-error" role="alert">
          {copyError}
        </p>
      ) : null}
    </div>
  );
}
