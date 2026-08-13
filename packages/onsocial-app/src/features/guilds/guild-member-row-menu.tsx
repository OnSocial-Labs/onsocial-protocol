'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
import {
  CopyIcon,
  DotsVerticalIcon,
  OsActionDrawerConfirm,
  OsIconAction,
  ShareIcon,
  TrashIcon,
  UserCircleFillIcon,
  UserIcon,
  UsersFillIcon,
  osIconActionGlyphClassName,
} from '@onsocial/ui';
import {
  ActionDrawer,
  type ActionDrawerItem,
} from '@/components/ui/action-drawer';
import { executeGuildMemberAction } from '@/features/guilds/execute-guild-member-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  guildBannedMemberRowActions,
  guildMemberActionConfirmCopy,
  guildMemberRowActions,
  type GuildMembersManageContext,
  type GuildMemberRowAction,
  type GuildMemberRowActionId,
} from '@/features/guilds/guild-member-row-actions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { fallbackLabel } from '@/lib/profile-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

interface GuildMemberRowMenuProps {
  groupId: string;
  member: GroupMemberRow;
  manageContext: GuildMembersManageContext;
  memberLabel: string;
  listMode?: 'members' | 'banned';
  onActionComplete?: (input: {
    memberId: string;
    actionId: GuildMemberRowActionId;
    propose: boolean;
  }) => void;
  onAddStorage?: (memberId: string) => void;
}

function actionIcon(id: GuildMemberRowActionId): ReactNode {
  switch (id) {
    case 'copy-handle':
      return <CopyIcon className="os-action-drawer-icon" aria-hidden />;
    case 'add-storage':
      return <ShareIcon className="os-action-drawer-icon" aria-hidden />;
    case 'remove-from-guild':
      return <TrashIcon className="os-action-drawer-icon" aria-hidden />;
    case 'ban-from-guild':
      return <TrashIcon className="os-action-drawer-icon" aria-hidden />;
    case 'unban-from-guild':
      return <UserIcon className="os-action-drawer-icon" aria-hidden />;
    case 'transfer-ownership':
      return <UserCircleFillIcon className="os-action-drawer-icon" aria-hidden />;
    case 'make-mod':
    case 'make-admin':
      return <UsersFillIcon className="os-action-drawer-icon" aria-hidden />;
    default:
      return <UserIcon className="os-action-drawer-icon" aria-hidden />;
  }
}

function toastCopyForAction(action: GuildMemberRowAction): {
  confirming: string;
  success: string;
  failure: string;
} {
  if (action.id === 'transfer-ownership') {
    return action.propose
      ? {
          confirming: txToastConfirming.proposingGuildUpdate,
          success: txToastSuccess.guildUpdateProposed,
          failure: txToastError.guildSettingsFailed,
        }
      : {
          confirming: txToastConfirming.transferringGuildOwnership,
          success: txToastSuccess.guildOwnershipTransferred,
          failure: txToastError.guildOwnershipTransferFailed,
        };
  }

  if (action.id === 'remove-from-guild') {
    return action.propose
      ? {
          confirming: txToastConfirming.proposingGuildUpdate,
          success: txToastSuccess.guildUpdateProposed,
          failure: txToastError.guildSettingsFailed,
        }
      : {
          confirming: txToastConfirming.removingGuildMember,
          success: txToastSuccess.guildMemberRemoved,
          failure: txToastError.guildRemoveMemberFailed,
        };
  }

  if (action.id === 'ban-from-guild') {
    return action.propose
      ? {
          confirming: txToastConfirming.proposingGuildUpdate,
          success: txToastSuccess.guildUpdateProposed,
          failure: txToastError.guildSettingsFailed,
        }
      : {
          confirming: txToastConfirming.banningGuildMember,
          success: txToastSuccess.guildMemberBanned,
          failure: txToastError.guildBanMemberFailed,
        };
  }

  if (action.id === 'unban-from-guild') {
    return action.propose
      ? {
          confirming: txToastConfirming.proposingGuildUpdate,
          success: txToastSuccess.guildUpdateProposed,
          failure: txToastError.guildSettingsFailed,
        }
      : {
          confirming: txToastConfirming.unbanningGuildMember,
          success: txToastSuccess.guildMemberUnbanned,
          failure: txToastError.guildUnbanMemberFailed,
        };
  }

  if (action.propose) {
    return {
      confirming: txToastConfirming.proposingGuildUpdate,
      success: txToastSuccess.guildUpdateProposed,
      failure: txToastError.guildSettingsFailed,
    };
  }

  return {
    confirming: txToastConfirming.updatingGuildMemberRole,
    success: txToastSuccess.guildMemberRoleUpdated,
    failure: txToastError.guildMemberRoleFailed,
  };
}

export function GuildMemberRowMenu({
  groupId,
  member,
  manageContext,
  memberLabel,
  listMode = 'members',
  onActionComplete,
  onAddStorage,
}: GuildMemberRowMenuProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmAction, setConfirmAction] =
    useState<GuildMemberRowAction | null>(null);
  const [keepOwnerAsMember, setKeepOwnerAsMember] = useState(false);
  const [supportOnSubmit, setSupportOnSubmit] = useState(true);
  const [pending, setPending] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const actions =
    listMode === 'banned'
      ? guildBannedMemberRowActions(member.memberId, manageContext)
      : guildMemberRowActions(member, manageContext);
  const menuLabel = `Manage ${memberLabel}`;
  const handle = fallbackLabel(member.memberId);
  const whoLabel = memberLabel.trim()
    ? `${memberLabel} · @${handle}`
    : `@${handle}`;

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
    setConfirmAction(null);
    setKeepOwnerAsMember(false);
    setSupportOnSubmit(true);
    setActionError(null);
  }, []);

  const resetConfirm = useCallback(() => {
    if (pending) return;
    setConfirmAction(null);
    setKeepOwnerAsMember(false);
    setSupportOnSubmit(true);
    setActionError(null);
  }, [pending]);

  const handleMenuAction = useCallback(
    async (action: GuildMemberRowAction) => {
      if (action.id === 'copy-handle') {
        try {
          await navigator.clipboard.writeText(`@${member.memberId}`);
          setCopyError(null);
        } catch {
          setCopyError('Could not copy handle.');
        }
        requestClose();
        return;
      }

      if (action.id === 'add-storage') {
        onAddStorage?.(member.memberId);
        requestClose();
        return;
      }

      setCopyError(null);
      setActionError(null);
      setKeepOwnerAsMember(false);
      setSupportOnSubmit(true);
      setConfirmAction(action);
    },
    [member.memberId, onAddStorage, requestClose]
  );

  const handleConfirm = useCallback(async () => {
    if (!confirmAction || pending) return;

    setPending(true);
    setActionError(null);
    try {
      const { client, accountId, wallet } = await getClient();
      const removeOldOwner =
        confirmAction.id === 'transfer-ownership'
          ? !keepOwnerAsMember
          : undefined;
      const response = await executeGuildMemberAction(client, {
        accountId,
        wallet,
        groupId,
        memberId: member.memberId,
        actionId: confirmAction.id,
        memberDriven: manageContext.memberDriven,
        removeOldOwner,
        autoVote: confirmAction.propose ? supportOnSubmit : undefined,
      });
      const toast = toastCopyForAction(confirmAction);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: toast.confirming,
        successMessage: toast.success,
        failureMessage: toast.failure,
        onFailure: (message) => setActionError(message),
      });
      if (confirmed) {
        onActionComplete?.({
          memberId: member.memberId,
          actionId: confirmAction.id,
          propose: Boolean(confirmAction.propose),
        });
        setConfirmAction(null);
        setClosing(true);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setActionError(
        cause instanceof Error ? cause.message : 'Could not update member.'
      );
    } finally {
      setPending(false);
    }
  }, [
    confirmAction,
    getClient,
    groupId,
    keepOwnerAsMember,
    manageContext.memberDriven,
    member.memberId,
    onActionComplete,
    pending,
    supportOnSubmit,
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
    ? guildMemberActionConfirmCopy(confirmAction)
    : null;

  return (
    <div className="guild-member-row-menu">
      <OsIconAction
        className={`guild-member-row-menu-trigger${
          sheetOpen ? ' is-open' : ''
        }`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        ariaLabel={menuLabel}
        disabled={pending}
      >
        <DotsVerticalIcon
          className={`${osIconActionGlyphClassName} guild-member-row-menu-icon`}
          aria-hidden
        />
      </OsIconAction>

      <ActionDrawer
        open={sheetOpen}
        onClose={confirmAction ? resetConfirm : requestClose}
        onClosed={handleClosed}
        label={confirmAction && confirmCopy ? confirmCopy.title : menuLabel}
        copy={whoLabel}
        listAriaLabel={menuLabel}
        closeAriaLabel={confirmAction ? 'Back to member actions' : 'Close menu'}
        items={confirmAction ? undefined : menuItems}
      >
        {confirmAction && confirmCopy ? (
          <OsActionDrawerConfirm
            body={confirmCopy.subtitle}
            confirmLabel={confirmCopy.confirmLabel}
            pending={pending}
            pendingLabel={
              confirmAction.propose
                ? 'Submitting…'
                : confirmAction.id === 'transfer-ownership'
                  ? 'Transferring…'
                  : 'Updating…'
            }
            onConfirm={() => void handleConfirm()}
            onCancel={resetConfirm}
          >
            {confirmAction.id === 'transfer-ownership' ? (
              <label className="os-notice-card-toggle">
                <input
                  type="checkbox"
                  checked={keepOwnerAsMember}
                  disabled={pending}
                  onChange={(event) =>
                    setKeepOwnerAsMember(event.target.checked)
                  }
                />
                <span>Keep me in the guild as a regular member</span>
              </label>
            ) : null}
            {confirmAction.propose ? (
              <label className="os-notice-card-toggle">
                <input
                  type="checkbox"
                  checked={supportOnSubmit}
                  disabled={pending}
                  onChange={(event) => setSupportOnSubmit(event.target.checked)}
                />
                <span>Support when submitted</span>
              </label>
            ) : null}
            {actionError ? (
              <p className="guild-form-error" role="alert">
                {actionError}
              </p>
            ) : null}
          </OsActionDrawerConfirm>
        ) : undefined}
      </ActionDrawer>

      {copyError ? (
        <p className="guild-member-row-menu-error" role="alert">
          {copyError}
        </p>
      ) : null}
    </div>
  );
}
