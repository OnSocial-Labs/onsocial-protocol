'use client';

import { useState } from 'react';
import type { GlassSheetPresentation } from '@onsocial/ui';
import { ProfileInviteHugSheet } from '@/components/profile/profile-invite-hug-sheet';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { SHEET_Z } from '@/lib/sheet-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

interface GuildAddMemberSheetProps {
  open: boolean;
  groupId: string;
  /** Existing members — excluded from search results. */
  memberIds?: readonly string[];
  onClose: () => void;
  onAdded?: () => void;
  /** Nested over Members — default slide-up (`enter`). */
  presentation?: GlassSheetPresentation;
  zIndex?: number;
}

export function GuildAddMemberSheet({
  open,
  groupId,
  memberIds = [],
  onClose,
  onAdded,
  presentation = 'enter',
  zIndex = SHEET_Z.nested,
}: GuildAddMemberSheetProps) {
  const { accountId: viewerId } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [pending, setPending] = useState(false);

  return (
    <ProfileInviteHugSheet
      open={open}
      onClose={onClose}
      label="Add member"
      copy="Search profiles to invite."
      closeAriaLabel="Close add member"
      excludeAccountIds={memberIds}
      viewerAccountId={viewerId}
      idleActionLabel="Add member"
      selectedActionLabel={(name) => `Add ${name}`}
      pending={pending}
      presentation={presentation}
      zIndex={zIndex}
      onConfirm={async (account) => {
        setPending(true);
        try {
          const { client } = await getClient();
          const response = await client.groups.addMember(
            groupId,
            account.accountId
          );
          const confirmed = await trackTransaction({
            txHashes: collectRelayTxHashes(response),
            submittedMessage: txToastConfirming.addingGuildMember,
            successMessage: txToastSuccess.guildMemberAdded,
            failureMessage: txToastError.guildAddMemberFailed,
          });
          if (confirmed) {
            onAdded?.();
            return true;
          }
          return false;
        } catch (cause) {
          if (!isWalletUserCancellation(cause)) {
            setTxResult({
              type: 'error',
              msg: txToastError.guildAddMemberFailed,
            });
          }
          return false;
        } finally {
          setPending(false);
        }
      }}
    />
  );
}
