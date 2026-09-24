'use client';

import { useCallback, useRef, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  guildMembershipConfirmKind,
  guildMembershipOutcome,
  nextGuildMembershipCache,
  requestGuildMembershipChange,
  type GuildMembershipActionSnapshot,
  type GuildMembershipConfirmKind,
  type GuildMembershipOutcome,
} from '@/features/guilds/guild-membership-action';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  setGuildMembershipActionPending,
  useGuildMembershipActionPending,
} from '@/lib/guild-membership-action-pending';
import { writeGuildMembershipCache } from '@/lib/guild-membership-cache';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export type {
  GuildMembershipActionSnapshot,
  GuildMembershipOutcome,
} from '@/features/guilds/guild-membership-action';
export {
  guildMembershipConfirmCopy,
  guildMembershipConfirmKind,
  guildMembershipOutcome,
  nextGuildMembershipCache,
  requestGuildMembershipChange,
} from '@/features/guilds/guild-membership-action';
export type { GuildMembershipConfirmKind } from '@/features/guilds/guild-membership-action';

function membershipToastCopy(input: {
  outcome: GuildMembershipOutcome;
  accessGated: boolean;
}): {
  submittedMessage: string;
  successMessage: string;
} {
  switch (input.outcome) {
    case 'left':
      return {
        submittedMessage: txToastConfirming.leavingGuild,
        successMessage: txToastSuccess.guildLeft,
      };
    case 'canceled':
      return {
        submittedMessage: txToastConfirming.cancelingGuildRequest,
        successMessage: txToastSuccess.guildRequestCanceled,
      };
    case 'requested':
      return {
        submittedMessage: txToastConfirming.requestingGuildAccess,
        successMessage: txToastSuccess.guildAccessRequested,
      };
    case 'joined':
      return {
        submittedMessage: txToastConfirming.joiningGuild,
        successMessage: txToastSuccess.guildJoined,
      };
  }
}

/**
 * Shared Join / Leave / Cancel for the guild page and guild thread.
 * Callers own ACL + labels; this owns the confirm drawer, toast, and cache write.
 */
export function useGuildMembershipAction({
  groupId,
  snapshot,
  canMutate = true,
  onOwnerManage,
  onConfirmed,
}: {
  groupId: string;
  snapshot: GuildMembershipActionSnapshot;
  /** Page waits for config + resolved ACL. Thread mutates from painted state. */
  canMutate?: boolean;
  onOwnerManage: () => void;
  onConfirmed: (outcome: GuildMembershipOutcome) => void | Promise<void>;
}): {
  confirmKind: GuildMembershipConfirmKind | null;
  actionPending: boolean;
  dismissConfirm: () => void;
  confirmMembership: () => void;
  handleMembershipClick: (opts?: {
    needsStorage?: boolean;
    onNeedsStorage?: () => void;
    requireResolvedAccess?: boolean;
    viewerAccessResolved?: boolean;
  }) => void;
} {
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const sharedPending = useGuildMembershipActionPending(accountId, groupId);
  const [localPending, setLocalPending] = useState(false);
  const [confirmKind, setConfirmKind] =
    useState<GuildMembershipConfirmKind | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const canMutateRef = useRef(canMutate);
  canMutateRef.current = canMutate;

  const dismissConfirm = useCallback(() => {
    setConfirmKind(null);
  }, []);

  const runMembershipAction = useCallback(async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    const current = snapshotRef.current;
    if (!canMutateRef.current) return;
    if (current.isBlacklisted) return;
    if (current.isMember && current.isOwner) {
      onOwnerManage();
      return;
    }
    if (current.joinPending && !current.joinCancelReady) return;

    setLocalPending(true);
    setGuildMembershipActionPending(accountId, groupId, true);
    const outcome = guildMembershipOutcome({
      wasMember: current.isMember,
      wasJoinPending: current.joinPending,
      accessGated: current.accessGated,
    });
    try {
      const { client } = await getClient();
      const response = await requestGuildMembershipChange(client, {
        groupId,
        isMember: current.isMember,
        joinPending: current.joinPending,
        memberDriven: current.memberDriven,
        pendingJoinProposalId: current.pendingJoinProposalId,
      });
      const toast = membershipToastCopy({
        outcome,
        accessGated: current.accessGated,
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: toast.submittedMessage,
        successMessage: toast.successMessage,
        failureMessage: txToastError.guildMembershipFailed,
      });

      if (confirmed) {
        setConfirmKind(null);
        if (accountId) {
          writeGuildMembershipCache(
            accountId,
            groupId,
            nextGuildMembershipCache({
              wasMember: current.isMember,
              wasJoinPending: current.joinPending,
              accessGated: current.accessGated,
            })
          );
        }
        await onConfirmed(outcome);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg: txToastError.guildMembershipFailed,
      });
    } finally {
      setLocalPending(false);
      setGuildMembershipActionPending(accountId, groupId, false);
    }
  }, [
    accountId,
    connect,
    getClient,
    groupId,
    isConnected,
    onConfirmed,
    onOwnerManage,
    setTxResult,
    trackTransaction,
  ]);

  const handleMembershipClick = useCallback(
    (opts?: {
      needsStorage?: boolean;
      onNeedsStorage?: () => void;
      requireResolvedAccess?: boolean;
      viewerAccessResolved?: boolean;
    }) => {
      const current = snapshotRef.current;
      if (opts?.needsStorage) {
        opts.onNeedsStorage?.();
        return;
      }
      if (current.isBlacklisted) return;
      if (current.joinPending && !current.joinCancelReady) return;
      if (
        opts?.requireResolvedAccess &&
        isConnected &&
        !opts.viewerAccessResolved
      ) {
        return;
      }
      if (!isConnected) {
        void connect();
        return;
      }
      const kind = guildMembershipConfirmKind(current);
      if (kind === 'owner') {
        onOwnerManage();
        return;
      }
      if (!kind) return;
      setConfirmKind(kind);
    },
    [connect, isConnected, onOwnerManage]
  );

  return {
    confirmKind,
    actionPending: localPending || sharedPending,
    dismissConfirm,
    confirmMembership: () => void runMembershipAction(),
    handleMembershipClick,
  };
}
