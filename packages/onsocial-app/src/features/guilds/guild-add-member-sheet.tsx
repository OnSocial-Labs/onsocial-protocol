'use client';

import { useState, type FormEvent } from 'react';
import {
  Divider,
  GlassSheet,
  OsSheetActions,
  OsSheetPrimaryAction,
  SheetCloseButton,
} from '@onsocial/ui';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

interface GuildAddMemberSheetProps {
  open: boolean;
  groupId: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function GuildAddMemberSheet({
  open,
  groupId,
  onClose,
  onAdded,
}: GuildAddMemberSheetProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [memberId, setMemberId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (pending) return;
    setMemberId('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = memberId.trim().toLowerCase();
    if (!normalized) {
      setError('Enter a NEAR account id.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const { client } = await getClient();
      const response = await client.groups.addMember(groupId, normalized);
      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.addingGuildMember,
        successMessage: txToastSuccess.guildMemberAdded,
        failureMessage: txToastError.guildAddMemberFailed,
      });
      if (confirmed) {
        setMemberId('');
        onAdded?.();
        onClose();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not add this member.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <GlassSheet
      open={open}
      onClose={handleClose}
      tone="os"
      initialDetent="peek"
      zIndex={57}
      presentation="swap"
      ariaLabelledBy="guild-add-member-title"
      backdropLabel="Close add member"
      panelClassName="guild-manage-sheet-panel"
      bodyClassName="guild-manage-sheet-body"
      header={
        <>
          <div className="standing-sheet-header guild-manage-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2
                    id="guild-add-member-title"
                    className="standing-sheet-subject-name"
                  >
                    Add member
                  </h2>
                  <p className="discover-sheet-subtitle">
                    Invite someone directly without a request.
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={handleClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <form className="guild-add-member-sheet" onSubmit={handleSubmit}>
        <label className="guild-field">
          <span>Account</span>
          <input
            className="guild-input"
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            placeholder="name.onsocial.testnet"
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
        </label>
        {error ? (
          <p className="guild-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <OsSheetActions>
          <OsSheetPrimaryAction pending={pending} type="submit">
            Add member
          </OsSheetPrimaryAction>
        </OsSheetActions>
      </form>
    </GlassSheet>
  );
}
