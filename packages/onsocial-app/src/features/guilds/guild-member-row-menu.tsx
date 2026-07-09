'use client';

import { useCallback, useState } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
import {
  DotsVerticalIcon,
  FloatingPanelMenu,
  OsSheetAction,
  OsSheetActions,
  osFloatingPanelBodyClassName,
  osFloatingPanelHeaderActiveClassName,
  osFloatingPanelHeaderClassName,
  osFloatingPanelHeaderLabelClassName,
  osFloatingPanelItemClassName,
  osIconActionClassName,
  osIconActionGlyphClassName,
  useDropdown,
} from '@onsocial/ui';
import { OsNoticeCard } from '@/components/ui/os-notice-card';
import { executeGuildMemberAction } from '@/features/guilds/execute-guild-member-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  guildMemberActionConfirmCopy,
  guildMemberRowActions,
  type GuildMembersManageContext,
  type GuildMemberRowAction,
  type GuildMemberRowActionId,
} from '@/features/guilds/guild-member-row-actions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { displayName, fallbackLabel } from '@/lib/profile-display';
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
  onActionComplete?: (input: {
    memberId: string;
    actionId: GuildMemberRowActionId;
    propose: boolean;
  }) => void;
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
  onActionComplete,
}: GuildMemberRowMenuProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();
  const [confirmAction, setConfirmAction] =
    useState<GuildMemberRowAction | null>(null);
  const [keepOwnerAsMember, setKeepOwnerAsMember] = useState(false);
  const [supportOnSubmit, setSupportOnSubmit] = useState(true);
  const [pending, setPending] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const actions = guildMemberRowActions(member, manageContext);
  const menuLabel = `Manage ${memberLabel}`;
  const handle = fallbackLabel(member.memberId);
  const whoLabel = memberLabel.trim()
    ? `${memberLabel} · @${handle}`
    : `@${handle}`;

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
        close();
        return;
      }

      setCopyError(null);
      setActionError(null);
      setKeepOwnerAsMember(false);
      setSupportOnSubmit(true);
      setConfirmAction(action);
    },
    [close, member.memberId]
  );

  const handleConfirm = useCallback(async () => {
    if (!confirmAction || pending) return;

    setPending(true);
    setActionError(null);
    try {
      const { client, accountId, wallet } = await getClient();
      const removeOldOwner =
        confirmAction.id === 'transfer-ownership' ? !keepOwnerAsMember : undefined;
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
        close();
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
    close,
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

  if (actions.length === 0) return null;

  const confirmCopy = confirmAction
    ? guildMemberActionConfirmCopy(confirmAction)
    : null;

  return (
    <div className="guild-member-row-menu" ref={containerRef}>
      <button
        type="button"
        className={`${osIconActionClassName} guild-member-row-menu-trigger${
          isOpen ? ' is-open' : ''
        }`}
        onClick={() => {
          if (isOpen && confirmAction) {
            resetConfirm();
            return;
          }
          toggle();
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={menuLabel}
        disabled={pending}
      >
        <DotsVerticalIcon
          className={`${osIconActionGlyphClassName} guild-member-row-menu-icon`}
          aria-hidden
        />
      </button>

      <FloatingPanelMenu
        ref={panelRef}
        open={isOpen}
        align="right"
        offset="sm"
        className="guild-member-row-menu-panel"
        role={confirmAction ? 'dialog' : 'menu'}
        aria-label={confirmAction ? confirmCopy?.title : menuLabel}
      >
        {confirmAction && confirmCopy ? (
          <OsNoticeCard
            className="guild-member-row-confirm"
            title={confirmCopy.title}
            meta={whoLabel}
            body={confirmCopy.subtitle}
            footer={
              <div className="os-commit-actions">
                {!pending ? (
                  <button
                    type="button"
                    className="os-commit-cancel"
                    onClick={resetConfirm}
                  >
                    Cancel
                  </button>
                ) : null}
                <OsSheetActions
                  layout="row-compact"
                  tone="frosted-primary"
                  borderless
                >
                  <OsSheetAction
                    type="button"
                    variant="primary"
                    ready
                    pending={pending}
                    pendingLabel={
                      confirmAction.propose
                        ? 'Submitting…'
                        : confirmAction.id === 'transfer-ownership'
                          ? 'Transferring…'
                          : 'Updating…'
                    }
                    disabled={pending}
                    onClick={() => void handleConfirm()}
                  >
                    {confirmCopy.confirmLabel}
                  </OsSheetAction>
                </OsSheetActions>
              </div>
            }
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
                  onChange={(event) =>
                    setSupportOnSubmit(event.target.checked)
                  }
                />
                <span>Support when submitted</span>
              </label>
            ) : null}
            {actionError ? (
              <p className="guild-form-error" role="alert">
                {actionError}
              </p>
            ) : null}
          </OsNoticeCard>
        ) : (
          <>
            <div className={osFloatingPanelHeaderClassName}>
              <p className={osFloatingPanelHeaderLabelClassName}>Member</p>
              <p className={osFloatingPanelHeaderActiveClassName}>
                {memberLabel || displayName(member.memberId)}
              </p>
            </div>

            <div className={osFloatingPanelBodyClassName}>
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className={`${osFloatingPanelItemClassName}${
                    action.destructive ? ' is-destructive' : ''
                  }`}
                  onClick={() => void handleMenuAction(action)}
                >
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </FloatingPanelMenu>

      {copyError ? (
        <p className="guild-member-row-menu-error" role="alert">
          {copyError}
        </p>
      ) : null}
    </div>
  );
}
