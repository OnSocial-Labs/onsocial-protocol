'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Proposal, ProposalTally } from '@onsocial/sdk';
import {
  GLASS_SHEET_PEEK_RATIO,
  OsHugSheet,
  OsProposalCardList,
  PulsingDots,
} from '@onsocial/ui';
import {
  isOwnJoinRequestProposal,
  joinRequesterFromProposal,
  listActiveJoinRequestProposals,
  listSubmittedJoinRequestsFromEvents,
  memberRequestRowToProposal,
  type GuildMemberRequestRow,
} from '@/features/guilds/guild-config';
import { guildProposalPresentation } from '@/features/guilds/guild-proposal-display';
import { GuildProposalCard } from '@/features/guilds/guild-proposal-card';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { SHEET_Z } from '@/lib/sheet-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

interface GuildMemberRequestsSheetProps {
  open: boolean;
  groupId: string;
  accountId: string | null;
  isMember: boolean;
  memberDriven: boolean;
  onClose: () => void;
  onResolved?: () => void;
}

type MemberRequestEntry =
  | { kind: 'proposal'; proposal: Proposal }
  | { kind: 'legacy'; row: GuildMemberRequestRow; proposal: Proposal };

function canVoteOnEntry(
  entry: MemberRequestEntry,
  accountId: string | null,
  isMember: boolean
): boolean {
  if (!isMember) return false;
  return !isOwnJoinRequestProposal(entry.proposal, accountId);
}

export function GuildMemberRequestsSheet({
  open,
  groupId,
  accountId,
  isMember,
  memberDriven,
  onClose,
  onResolved,
}: GuildMemberRequestsSheetProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [entries, setEntries] = useState<MemberRequestEntry[]>([]);
  const [viewerVotes, setViewerVotes] = useState<Map<string, boolean>>(
    () => new Map()
  );
  const [tallies, setTallies] = useState<Map<string, ProposalTally | null>>(
    () => new Map()
  );
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<
    Map<string, 'support' | 'oppose' | 'cancel'>
  >(() => new Map());
  const [actionError, setActionError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    try {
      const client = createReadOnlyOnSocialClient();
      if (memberDriven) {
        const proposals = await client.groups.listProposals(groupId, {
          limit: 40,
        });
        const joinProposals = listActiveJoinRequestProposals(
          proposals as Proposal[]
        ).map((row) => {
          const proposal = proposals.find((item) => item.id === row.id);
          return {
            kind: 'proposal' as const,
            proposal: (proposal ?? {
              id: row.id,
              sequence_number: 0,
              title: '',
              type: 'join_request',
              status: 'active',
              description: row.message ?? '',
              proposer: row.requesterId,
              target: row.requesterId,
              data: {
                JoinRequest: {
                  requester: row.requesterId,
                  message: row.message,
                },
              },
              created_at:
                row.requestedAt !== null && row.requestedAt !== undefined
                  ? String(row.requestedAt)
                  : '',
              voting_config: {
                participation_quorum_bps: 5100,
                majority_threshold_bps: 5001,
                voting_period: '7d',
              },
            }) as Proposal,
          };
        });

        const voteEntries = await Promise.all(
          joinProposals.map(async (entry) => {
            const [voteResult, tallyResult] = await Promise.allSettled([
              accountId
                ? client.groups.getVote(groupId, entry.proposal.id, accountId)
                : Promise.resolve(null),
              client.groups.getProposalTally(groupId, entry.proposal.id),
            ]);

            return {
              proposalId: entry.proposal.id,
              approve:
                voteResult.status === 'fulfilled'
                  ? (voteResult.value?.approve ?? null)
                  : null,
              tally:
                tallyResult.status === 'fulfilled' ? tallyResult.value : null,
            };
          })
        );

        setEntries(joinProposals);
        setViewerVotes(
          new Map(
            voteEntries
              .filter((entry) => entry.approve !== null)
              .map((entry) => [entry.proposalId, entry.approve as boolean])
          )
        );
        setTallies(
          new Map(voteEntries.map((entry) => [entry.proposalId, entry.tally]))
        );
      } else {
        const events = await client.query.governance.joinRequests(groupId, {
          status: 'submitted',
          limit: 40,
        });
        const rows = listSubmittedJoinRequestsFromEvents(events);
        setEntries(
          rows.map((row) => ({
            kind: 'legacy' as const,
            row,
            proposal: memberRequestRowToProposal(row),
          }))
        );
        setViewerVotes(new Map());
        setTallies(new Map());
      }
      setLoadState('ready');
    } catch (cause) {
      setLoadState('error');
      setLoadError(
        cause instanceof Error
          ? cause.message
          : 'Could not load member requests.'
      );
    }
  }, [accountId, groupId, memberDriven]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void loadRequests();
    });
    return () => {
      cancelled = true;
    };
  }, [loadRequests, open]);

  const visibleEntries = useMemo(() => {
    if (isMember) return entries;
    if (!accountId) return [];
    return entries.filter((entry) =>
      isOwnJoinRequestProposal(entry.proposal, accountId)
    );
  }, [accountId, entries, isMember]);

  const profileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of visibleEntries) {
      const presentation = guildProposalPresentation(entry.proposal);
      if (presentation.targetAccountId) ids.add(presentation.targetAccountId);
      if (entry.proposal.proposer?.trim()) {
        ids.add(entry.proposal.proposer.trim());
      }
    }
    return [...ids];
  }, [visibleEntries]);
  const profiles = usePostAuthorProfiles(profileIds);

  const viewingOwnPending =
    !isMember &&
    visibleEntries.some((entry) =>
      isOwnJoinRequestProposal(entry.proposal, accountId)
    );

  const runVote = async (entry: MemberRequestEntry, approve: boolean) => {
    setActionError(null);
    setPendingActions((current) =>
      new Map(current).set(entry.proposal.id, approve ? 'support' : 'oppose')
    );
    try {
      const { client } = await getClient();
      const response =
        entry.kind === 'proposal'
          ? await client.groups.vote(groupId, entry.proposal.id, approve)
          : approve
            ? await client.groups.approveJoin(groupId, entry.row.requesterId)
            : await client.groups.rejectJoin(groupId, entry.row.requesterId);

      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: memberDriven
          ? txToastConfirming.votingGuildProposal
          : txToastConfirming.reviewingGuildRequest,
        successMessage: memberDriven
          ? txToastSuccess.guildVoteRecorded
          : approve
            ? txToastSuccess.guildRequestApproved
            : txToastSuccess.guildRequestDenied,
        failureMessage: memberDriven
          ? txToastError.guildVoteFailed
          : txToastError.guildRequestReviewFailed,
      });

      if (confirmed) {
        setEntries((current) =>
          current.filter((item) => item.proposal.id !== entry.proposal.id)
        );
        onResolved?.();
        if (memberDriven) {
          await loadRequests();
        }
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setActionError(
        cause instanceof Error
          ? cause.message
          : 'Could not update this request.'
      );
    } finally {
      setPendingActions((current) => {
        const next = new Map(current);
        next.delete(entry.proposal.id);
        return next;
      });
    }
  };

  const runCancel = async (entry: MemberRequestEntry) => {
    setActionError(null);
    setPendingActions((current) =>
      new Map(current).set(entry.proposal.id, 'cancel')
    );
    try {
      const { client } = await getClient();
      const response =
        entry.kind === 'proposal'
          ? await client.groups.cancelProposal(groupId, entry.proposal.id)
          : await client.groups.cancelJoin(groupId);

      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.cancelingGuildRequest,
        successMessage: txToastSuccess.guildRequestCanceled,
        failureMessage: txToastError.guildMembershipFailed,
      });

      if (confirmed) {
        setEntries((current) =>
          current.filter((item) => item.proposal.id !== entry.proposal.id)
        );
        onResolved?.();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setActionError(
        cause instanceof Error
          ? cause.message
          : 'Could not cancel this request.'
      );
    } finally {
      setPendingActions((current) => {
        const next = new Map(current);
        next.delete(entry.proposal.id);
        return next;
      });
    }
  };

  const subtitle = memberDriven
    ? viewingOwnPending
      ? 'Your join request is waiting for member votes.'
      : 'Collaborative guilds vote on join proposals.'
    : isMember
      ? 'Approve or deny access requests.'
      : 'Only guild members can review access requests.';

  const voteLabels = memberDriven
    ? { supportLabel: 'Support', opposeLabel: 'Oppose' }
    : { supportLabel: 'Approve', opposeLabel: 'Deny' };

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label="Member requests"
      copy={subtitle}
      closeAriaLabel="Close"
      backdropLabel="Close member requests"
      zIndex={SHEET_Z.facts}
      sizing="full"
      initialDetent="peek"
      peekRatio={GLASS_SHEET_PEEK_RATIO}
      titleId="guild-member-requests-title"
      headerClassName="guild-manage-sheet-header"
      panelClassName="guild-manage-sheet-panel"
      bodyClassName="guild-manage-sheet-body"
    >
      <div className="guild-member-requests-sheet">
        {loadState === 'loading' ? (
          <div className="guild-manage-sheet-state">
            <PulsingDots size="sm" />
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="guild-manage-sheet-state">
            <p>{loadError ?? 'Could not load member requests.'}</p>
            <button
              type="button"
              className="guild-secondary-button"
              onClick={() => void loadRequests()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {loadState === 'ready' && visibleEntries.length === 0 ? (
          <div className="guild-manage-sheet-empty">
            <p className="guild-manage-sheet-empty-primary">
              {viewingOwnPending || isMember
                ? 'No pending requests'
                : 'Nothing to review yet'}
            </p>
            <p className="guild-manage-sheet-empty-secondary">
              {isMember
                ? 'New access requests will show up here.'
                : 'Join this guild to vote on access requests.'}
            </p>
          </div>
        ) : null}

        {actionError ? (
          <p className="guild-form-error" role="alert">
            {actionError}
          </p>
        ) : null}

        {loadState === 'ready' && visibleEntries.length > 0 ? (
          <OsProposalCardList className="guild-proposal-list">
            {visibleEntries.map((entry) => {
              const ownRequest = isOwnJoinRequestProposal(
                entry.proposal,
                accountId
              );
              const canVote = canVoteOnEntry(entry, accountId, isMember);
              const requesterId = joinRequesterFromProposal(entry.proposal);

              return (
                <GuildProposalCard
                  key={entry.proposal.id}
                  proposal={entry.proposal}
                  tally={tallies.get(entry.proposal.id) ?? null}
                  viewerVote={viewerVotes.get(entry.proposal.id)}
                  canVote={canVote}
                  pendingAction={pendingActions.get(entry.proposal.id) ?? null}
                  isOwnRequest={ownRequest}
                  suppressProposer={
                    ownRequest || requesterId === entry.proposal.proposer
                  }
                  showSequence={entry.kind === 'proposal'}
                  supportLabel={voteLabels.supportLabel}
                  opposeLabel={voteLabels.opposeLabel}
                  profiles={profiles}
                  onSupport={() => void runVote(entry, true)}
                  onOppose={() => void runVote(entry, false)}
                  onCancel={
                    ownRequest ? () => void runCancel(entry) : undefined
                  }
                />
              );
            })}
          </OsProposalCardList>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
