'use client';

import { useState } from 'react';
import { ProfileInviteHugSheet } from '@/components/profile/profile-invite-hug-sheet';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { hubRosterTransactionToast } from '@/features/scarces/hub-roster-transaction-toast';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export type HubAddRosterKind = 'creator' | 'moderator';

interface HubAddRosterSheetProps {
  open: boolean;
  kind: HubAddRosterKind;
  appId: string;
  ownerId: string;
  /** Current roster seats for this kind — excluded from search. */
  occupiedIds?: readonly string[];
  onClose: () => void;
  onAdded?: () => void;
}

export function HubAddRosterSheet({
  open,
  kind,
  appId,
  ownerId,
  occupiedIds = [],
  onClose,
  onAdded,
}: HubAddRosterSheetProps) {
  const { accountId: viewerId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [pending, setPending] = useState(false);
  const toast = hubRosterTransactionToast(kind);
  const isCreator = kind === 'creator';

  return (
    <ProfileInviteHugSheet
      open={open}
      onClose={onClose}
      label={isCreator ? 'Add creator' : 'Add moderator'}
      copy={
        isCreator
          ? 'Search profiles who can publish here.'
          : 'Search profiles for the mod team.'
      }
      closeAriaLabel={
        isCreator ? 'Close add creator' : 'Close add moderator'
      }
      excludeAccountIds={[ownerId, ...occupiedIds]}
      viewerAccountId={viewerId}
      idleActionLabel={isCreator ? 'Add creator' : 'Add moderator'}
      selectedActionLabel={(name) => `Add ${name}`}
      pending={pending}
      onConfirm={async (account) => {
        setPending(true);
        try {
          const { accountId, wallet } = await getSigningWallet();
          const client = createAppScarcesWalletClient(accountId, wallet);
          const response = isCreator
            ? await client.scarces.apps.addApprovedCreator(
                appId,
                account.accountId
              )
            : await client.scarces.apps.addModerator(
                appId,
                account.accountId
              );
          const confirmed = await trackTransaction({
            txHashes: collectRelayTxHashes(response),
            submittedMessage: toast.confirming,
            successMessage: toast.success,
            failureMessage: toast.failure,
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
              msg:
                cause instanceof Error && cause.message.trim()
                  ? cause.message
                  : toast.failure,
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
