'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Proposal, ProposalTally } from '@onsocial/sdk';
import {
  Divider,
  GLASS_SHEET_PEEK_RATIO,
  OsHugSheet,
  PulsingDots,
} from '@onsocial/ui';
import { listActiveJoinRequestProposals } from '@/features/guilds/guild-config';
import {
  guildProposalPresentation,
  isTerminalGuildProposalStatus,
  partitionGuildGovernanceProposals,
} from '@/features/guilds/guild-proposal-display';
import { GuildProposalCard } from '@/features/guilds/guild-proposal-card';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const PROPOSAL_SOFT_RETRY_MS = [2000, 5000] as const;

interface GuildProposalsSheetProps {
  open: boolean;
  groupId: string;
  accountId: string | null;
  isMember: boolean;
  memberDriven: boolean;
  onClose: () => void;
  onOpenRequests?: () => void;
  onResolved?: () => void;
}

function bumpTallyForVote(
  tally: ProposalTally | null | undefined,
  approve: boolean
): ProposalTally {
  const yes = Number(tally?.yes_votes) || 0;
  const total = Number(tally?.total_votes) || 0;
  return {
    yes_votes: approve ? yes + 1 : yes,
    total_votes: total + 1,
    created_at: tally?.created_at ?? '0',
    locked_member_count: Number(tally?.locked_member_count) || 0,
  };
}

export function GuildProposalsSheet({
  open,
  groupId,
  accountId,
  isMember,
  memberDriven,
  onClose,
  onOpenRequests,
  onResolved,
}: GuildProposalsSheetProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [resolvedProposals, setResolvedProposals] = useState<Proposal[]>([]);
  const [allProposals, setAllProposals] = useState<Proposal[]>([]);
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
    Map<string, 'support' | 'oppose'>
  >(() => new Map());
  const [actionError, setActionError] = useState<string | null>(null);
  const retryTimersRef = useRef<number[]>([]);

  const clearRetryTimers = useCallback(() => {
    for (const timerId of retryTimersRef.current) {
      window.clearTimeout(timerId);
    }
    retryTimersRef.current = [];
  }, []);

  useEffect(() => () => clearRetryTimers(), [clearRetryTimers]);

  const applyProposalSnapshot = useCallback(
    (
      proposal: Proposal,
      tally: ProposalTally | null,
      approve: boolean | null
    ) => {
      const terminal = isTerminalGuildProposalStatus(proposal.status);

      setProposals((current) => {
        const without = current.filter((row) => row.id !== proposal.id);
        if (terminal) return without;
        const index = current.findIndex((row) => row.id === proposal.id);
        if (index === -1) return [proposal, ...without];
        return current.map((row) => (row.id === proposal.id ? proposal : row));
      });

      setResolvedProposals((current) => {
        const without = current.filter((row) => row.id !== proposal.id);
        if (!terminal) return without;
        return [proposal, ...without].slice(0, 5);
      });

      setAllProposals((current) => {
        const index = current.findIndex((row) => row.id === proposal.id);
        if (index === -1) return [proposal, ...current];
        return current.map((row) => (row.id === proposal.id ? proposal : row));
      });

      setTallies((current) => new Map(current).set(proposal.id, tally));
      setViewerVotes((current) => {
        const next = new Map(current);
        if (approve === null) next.delete(proposal.id);
        else next.set(proposal.id, approve);
        return next;
      });
    },
    []
  );

  const refreshOneProposal = useCallback(
    async (proposalId: string) => {
      const client = createReadOnlyOnSocialClient();
      const [proposalResult, tallyResult, voteResult] =
        await Promise.allSettled([
          client.groups.getProposal(groupId, proposalId),
          client.groups.getProposalTally(groupId, proposalId),
          accountId
            ? client.groups.getVote(groupId, proposalId, accountId)
            : Promise.resolve(null),
        ]);

      const proposal =
        proposalResult.status === 'fulfilled' ? proposalResult.value : null;
      if (!proposal) return;

      applyProposalSnapshot(
        proposal,
        tallyResult.status === 'fulfilled' ? tallyResult.value : null,
        voteResult.status === 'fulfilled'
          ? (voteResult.value?.approve ?? null)
          : null
      );
    },
    [accountId, applyProposalSnapshot, groupId]
  );

  const loadProposals = useCallback(
    async (options: { soft?: boolean } = {}) => {
      const soft = options.soft === true;
      if (!soft) {
        setLoadState('loading');
        setLoadError(null);
      }
      try {
        const client = createReadOnlyOnSocialClient();
        const rows = await client.groups.listProposals(groupId, { limit: 40 });
        const { active, resolved } = partitionGuildGovernanceProposals(rows);
        setAllProposals(rows);
        setProposals(active);
        setResolvedProposals(resolved);

        const loadTargets = [...active, ...resolved];
        const voteEntries = await Promise.all(
          loadTargets.map(async (proposal) => {
            const [voteResult, tallyResult] = await Promise.allSettled([
              accountId
                ? client.groups.getVote(groupId, proposal.id, accountId)
                : Promise.resolve(null),
              client.groups.getProposalTally(groupId, proposal.id),
            ]);

            return {
              proposalId: proposal.id,
              approve:
                voteResult.status === 'fulfilled'
                  ? (voteResult.value?.approve ?? null)
                  : null,
              tally:
                tallyResult.status === 'fulfilled' ? tallyResult.value : null,
            };
          })
        );

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
        setLoadState('ready');
      } catch (cause) {
        if (!soft) {
          setLoadState('error');
          setLoadError(
            cause instanceof Error ? cause.message : 'Could not load proposals.'
          );
        }
      }
    },
    [accountId, groupId]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    clearRetryTimers();
    void Promise.resolve().then(() => {
      if (!cancelled) void loadProposals();
    });
    return () => {
      cancelled = true;
      clearRetryTimers();
    };
  }, [clearRetryTimers, loadProposals, open]);

  const scheduleProposalRetries = useCallback(
    (proposalId: string) => {
      clearRetryTimers();
      retryTimersRef.current = PROPOSAL_SOFT_RETRY_MS.map((delay) =>
        window.setTimeout(() => {
          void refreshOneProposal(proposalId);
        }, delay)
      );
    },
    [clearRetryTimers, refreshOneProposal]
  );

  const runVote = async (proposal: Proposal, approve: boolean) => {
    setActionError(null);
    setPendingActions((current) =>
      new Map(current).set(proposal.id, approve ? 'support' : 'oppose')
    );
    try {
      const { client } = await getClient();
      const response = await client.groups.vote(groupId, proposal.id, approve);
      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.votingGuildProposal,
        successMessage: txToastSuccess.guildVoteRecorded,
        failureMessage: txToastError.guildVoteFailed,
      });

      if (confirmed) {
        // Keep the sheet mounted — update this card only, then soft-reconcile.
        setViewerVotes((current) => new Map(current).set(proposal.id, approve));
        setTallies((current) =>
          new Map(current).set(
            proposal.id,
            bumpTallyForVote(current.get(proposal.id), approve)
          )
        );
        onResolved?.();
        await refreshOneProposal(proposal.id);
        scheduleProposalRetries(proposal.id);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setActionError(
        cause instanceof Error ? cause.message : 'Could not submit vote.'
      );
    } finally {
      setPendingActions((current) => {
        const next = new Map(current);
        next.delete(proposal.id);
        return next;
      });
    }
  };

  const joinRequestCount = listActiveJoinRequestProposals(allProposals).length;
  const canVote = memberDriven && isMember;
  const profileIds = useMemo(() => {
    const ids = new Set<string>();
    for (const proposal of [...proposals, ...resolvedProposals]) {
      const presentation = guildProposalPresentation(proposal);
      if (presentation.targetAccountId) ids.add(presentation.targetAccountId);
      if (proposal.proposer?.trim()) ids.add(proposal.proposer.trim());
    }
    return [...ids];
  }, [proposals, resolvedProposals]);
  const profiles = usePostAuthorProfiles(profileIds);

  const subtitle = canVote
    ? 'Support or oppose active governance items.'
    : memberDriven
      ? 'Join this guild to vote on proposals.'
      : 'Active governance items excluding join requests.';

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label="Proposals"
      copy={subtitle}
      closeAriaLabel="Close"
      backdropLabel="Close proposals"
      zIndex={57}
      sizing="full"
      initialDetent="peek"
      peekRatio={GLASS_SHEET_PEEK_RATIO}
      titleId="guild-proposals-title"
      headerClassName="guild-manage-sheet-header"
      panelClassName="guild-manage-sheet-panel"
      bodyClassName="guild-manage-sheet-body"
    >
      <div className="guild-proposals-sheet">
        {onOpenRequests && joinRequestCount > 0 ? (
          <button
            type="button"
            className="guild-secondary-button guild-proposals-requests-link"
            onClick={onOpenRequests}
          >
            {joinRequestCount} join{' '}
            {joinRequestCount === 1 ? 'request' : 'requests'} in Member requests
          </button>
        ) : null}

        {loadState === 'loading' ? (
          <div className="guild-manage-sheet-state">
            <PulsingDots size="sm" />
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="guild-manage-sheet-state">
            <p>{loadError ?? 'Could not load proposals.'}</p>
            <button
              type="button"
              className="guild-secondary-button"
              onClick={() => void loadProposals()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {loadState === 'ready' &&
        proposals.length === 0 &&
        resolvedProposals.length === 0 ? (
          <div className="guild-manage-sheet-empty">
            <p className="guild-manage-sheet-empty-primary">
              No active proposals
            </p>
            <p className="guild-manage-sheet-empty-secondary">
              Permission changes and other governance items will appear here.
            </p>
          </div>
        ) : null}

        {loadState === 'ready' &&
        proposals.length === 0 &&
        resolvedProposals.length > 0 ? (
          <p className="guild-proposals-section-note">No active proposals</p>
        ) : null}

        {actionError ? (
          <p className="guild-form-error" role="alert">
            {actionError}
          </p>
        ) : null}

        {loadState === 'ready' && proposals.length > 0 ? (
          <div className="guild-proposal-list">
            {proposals.map((proposal) => (
              <GuildProposalCard
                key={proposal.id}
                proposal={proposal}
                tally={tallies.get(proposal.id) ?? null}
                viewerVote={viewerVotes.get(proposal.id)}
                canVote={canVote}
                pendingAction={pendingActions.get(proposal.id) ?? null}
                profiles={profiles}
                onSupport={() => void runVote(proposal, true)}
                onOppose={() => void runVote(proposal, false)}
              />
            ))}
          </div>
        ) : null}

        {loadState === 'ready' && resolvedProposals.length > 0 ? (
          <>
            <Divider
              variant="detail"
              className="guild-proposals-section-divider"
            />
            <p className="guild-proposals-section-label">Recently resolved</p>
            <div className="guild-proposal-list guild-proposal-list--resolved">
              {resolvedProposals.map((proposal) => (
                <GuildProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  tally={tallies.get(proposal.id) ?? null}
                  viewerVote={viewerVotes.get(proposal.id)}
                  canVote={false}
                  pendingAction={null}
                  profiles={profiles}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
