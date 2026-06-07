'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import { actOnGovernanceProposal } from '@/features/governance/api';
import {
  DAO_STATUS_STYLES,
  deriveGovernanceCardView,
  formatActionLabel,
  renderHighlightedJson,
  safeJsonStringify,
} from '@/features/governance/governance-card-helpers';
import {
  refreshGovernanceProposalAfterAction,
  useGovernanceCardDaoState,
} from '@/features/governance/use-governance-card-dao-state';
import { GovernanceAccountChip } from '@/features/governance/governance-account-chip';
import {
  GovernanceCardVoteSkeleton,
  GovernanceCollapsiblePanel,
  GovernanceGuardianActions,
  GovernanceLiveSummary,
  GovernanceVoteActivity,
  ShareProposal,
} from '@/features/governance/governance-card-sections';
import {
  GovernanceProposalOnChainRefLabel,
  GovernanceProposalSummary,
} from '@/features/governance/governance-proposal-identity-row';
import { GovernanceDescriptionClamp } from '@/features/governance/governance-description-clamp';
import {
  deriveProposalPresentationFromDaoProposal,
  resolveBootstrapDaoProposal,
} from '@/features/governance/governance-proposal-presentation';
import { GovernanceProposalStrip } from '@/features/governance/governance-proposal-strip';
import type {
  Application,
  GovernanceDaoAction,
  GovernanceDaoPolicy,
} from '@/features/governance/types';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';

const POST_ACTION_REFRESH_WINDOW_MS = 60_000;
const ONSOCIAL_TELEGRAM_URL = 'https://t.me/onsocialprotocol';

function governanceCardStyle(stripColor: string): CSSProperties {
  return {
    borderLeftColor: stripColor,
    borderTopColor: stripColor,
    '--_accent-border': stripColor,
  } as CSSProperties;
}

export function ProtocolGovernanceCard({
  app,
  feedDaoPolicy = null,
  onGovernanceUpdated,
  interactive = true,
}: {
  app: Application;
  feedDaoPolicy?: GovernanceDaoPolicy | null;
  onGovernanceUpdated?: () => void | Promise<void>;
  interactive?: boolean;
}) {
  const { wallet, accountId, isConnected } = useWallet();
  const router = useRouter();

  const handleCardClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'a, button, [role="button"], input, textarea, select, pre, code'
        )
      )
        return;
      router.push(
        buildGovernanceProposalPath(
          app.app_id,
          app.governance_proposal?.proposal_id ?? null
        )
      );
    },
    [router, app.app_id, app.governance_proposal?.proposal_id]
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [actionLoading, setActionLoading] =
    useState<GovernanceDaoAction | null>(null);
  const [actionTxHash, setActionTxHash] = useState<string | null>(null);
  const [postActionRefreshUntil, setPostActionRefreshUntil] = useState<
    number | null
  >(null);
  const [confirmedAction, setConfirmedAction] =
    useState<GovernanceDaoAction | null>(null);
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const proposal = app.governance_proposal;
  const {
    daoAccountId,
    liveProposalId,
    daoPolicy,
    liveProposal,
    daoLoading,
    setDaoPolicy,
    setLiveProposal,
  } = useGovernanceCardDaoState({
    proposal,
    feedDaoPolicy,
    postActionRefreshUntil,
    onPostActionRefreshComplete: () => setPostActionRefreshUntil(null),
  });
  const proposalFallbackStyle = proposal?.status
    ? DAO_STATUS_STYLES[proposal.status]
    : undefined;
  useEffect(() => {
    if (liveProposal?.status !== 'InProgress') {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [liveProposal?.status]);

  const {
    connectedRole,
    activeVotingRole,
    currentVote,
    canApprove,
    canReject,
    canRemove,
    canFinalize,
    liveStatusStyle,
    approveVotes,
    rejectVotes,
    removeVotes,
    votingProgress,
    eligibleVoterAccounts,
    voteEntries,
    submissionTime,
    reviewExpiry,
    statusSummary,
    functionCallSummary,
    proposalTxHref,
    latestActionLink,
    resolvedOutcomeLabel,
    guardianDecisionSummary,
    finalizeLabel,
  } = deriveGovernanceCardView({
    accountId,
    isConnected,
    daoPolicy,
    liveProposal,
    proposal,
    actionTxHash,
    isAppWalletViewer: false,
    nowMs,
  });

  async function handleGovernanceAction(action: GovernanceDaoAction) {
    if (
      !wallet ||
      !accountId ||
      !daoAccountId ||
      liveProposalId === null ||
      !liveProposal
    ) {
      setTxResult({
        type: 'error',
        msg: 'Connect a guardian wallet to continue.',
      });
      return;
    }

    setActionLoading(action);
    clearTxResult();
    setActionTxHash(null);

    try {
      const txHash = await actOnGovernanceProposal(
        wallet,
        accountId,
        liveProposalId,
        action,
        liveProposal.kind,
        daoAccountId
      );

      if (!txHash) {
        throw new Error(
          'Wallet submitted the transaction but no tx hash was returned'
        );
      }

      setActionTxHash(txHash);

      const confirmed = await trackTransaction({
        txHashes: [txHash],
        submittedMessage: `${formatActionLabel(action)} submitted…`,
        successMessage: `${formatActionLabel(action)} confirmed.`,
        failureMessage: `${formatActionLabel(action)} failed.`,
      });

      if (!confirmed) {
        return;
      }

      try {
        const { policy, proposal: nextProposal } =
          await refreshGovernanceProposalAfterAction({
            daoAccountId,
            proposalId: liveProposalId,
            feedDaoPolicy,
          });
        setDaoPolicy(policy);
        setLiveProposal(nextProposal);
        await onGovernanceUpdated?.();
      } catch {
        setTxResult({
          type: 'error',
          msg: 'Action confirmed but DAO state failed to refresh.',
        });
      }

      setConfirmedAction(action);
      setTimeout(() => setConfirmedAction(null), 3000);
      setPostActionRefreshUntil(Date.now() + POST_ACTION_REFRESH_WINDOW_MS);
    } catch (error) {
      setTxResult({
        type: 'error',
        msg: error instanceof Error ? error.message : 'Action failed.',
      });
    } finally {
      setActionLoading(null);
    }
  }

  function handleAdvancedRemove() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Remove is intended for exceptional cases, such as spam or an invalid proposal. Remove this proposal from active review?'
      )
    ) {
      return;
    }

    void handleGovernanceAction('VoteRemove');
  }

  const presentation = deriveProposalPresentationFromDaoProposal(
    liveProposal ?? resolveBootstrapDaoProposal(proposal),
    {
      label: app.label,
      description: app.description ?? proposal?.description,
    }
  );
  const fallbackProposalHref = proposal?.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${proposal.tx_hash}`
    : null;
  const rawDaoProposal = liveProposal
    ? safeJsonStringify({
        id: liveProposalId,
        proposer: liveProposal.proposer,
        description: liveProposal.description,
        status: liveProposal.status,
        kind: liveProposal.kind,
        vote_counts: liveProposal.vote_counts,
        votes: liveProposal.votes,
        submission_time: liveProposal.submission_time,
        last_actions_log: liveProposal.last_actions_log,
      })
    : null;

  const stripColor =
    liveStatusStyle?.stripColor ??
    proposalFallbackStyle?.stripColor ??
    (proposal?.status === 'Approved'
      ? 'var(--portal-green-border-strong)'
      : proposal?.status === 'Rejected' || proposal?.status === 'Removed'
        ? 'var(--portal-red-border-strong)'
        : proposal?.status === 'Expired' || proposal?.status === 'Failed'
          ? 'var(--portal-amber-border-strong)'
          : 'var(--portal-blue-border-strong)');

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel
        id={app.app_id}
        radius="xl"
        tone="solid"
        borderTone="strong"
        padding="roomy"
        className={`relative overflow-hidden border-l-[3px] border-t-[3px] shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] ${
          interactive ? 'group/card cursor-pointer' : ''
        }`}
        style={governanceCardStyle(stripColor)}
        onClick={interactive ? handleCardClick : undefined}
      >
        {liveProposalId !== null && (
          <GovernanceProposalStrip
            proposalId={liveProposalId}
            actionBadge={presentation.actionBadge}
            submissionTime={submissionTime}
            statusStyle={liveStatusStyle ?? proposalFallbackStyle ?? null}
            reviewExpiry={reviewExpiry}
            interactive={interactive}
          />
        )}
        <div className="border-b border-fade-section pb-3.5">
          <GovernanceProposalSummary
            presentation={presentation}
            className={
              interactive ? 'transition-opacity group-hover/card:opacity-90' : undefined
            }
          />

          {presentation.showProposerSeparately && presentation.proposer ? (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 portal-type-label text-muted-foreground">
              <span className="shrink-0 portal-eyebrow">
                Proposer
              </span>
              <GovernanceAccountChip
                accountId={presentation.proposer}
                avatarClassName="h-5 w-5"
                compact
              />
            </div>
          ) : null}

          {presentation.onChainDescription ? (
            <GovernanceDescriptionClamp
              text={presentation.onChainDescription}
              className="mt-1.5 sm:mt-2"
            />
          ) : null}
        </div>

        {daoLoading && liveProposalId !== null && <GovernanceCardVoteSkeleton />}

        {!daoLoading && liveProposal && liveStatusStyle && (
          <div className="mt-4">
            <GovernanceLiveSummary
              liveProposal={liveProposal}
              liveProposalId={liveProposalId}
              liveStatusStyle={liveStatusStyle}
              statusSummary={statusSummary}
              currentVote={currentVote}
              resolvedOutcomeLabel={resolvedOutcomeLabel}
              functionCallSummary={functionCallSummary}
              submissionTime={submissionTime}
              reviewExpiry={reviewExpiry}
              votingProgress={votingProgress}
              activeVotingRole={activeVotingRole}
              rejectVotes={rejectVotes}
              removeVotes={removeVotes}
              approveVotes={approveVotes}
              confirmedAction={confirmedAction}
            />

            <GovernanceVoteActivity
              voteEntries={voteEntries}
              accountId={accountId}
              latestActionLink={latestActionLink}
              activeVotingRole={activeVotingRole}
              eligibleVoterAccounts={eligibleVoterAccounts}
            />

            {rawDaoProposal && (
              <GovernanceCollapsiblePanel
                label="Raw proposal"
                isOpen={technicalDetailsOpen}
                onToggle={() => setTechnicalDetailsOpen((open) => !open)}
              >
                {presentation.onChainAction ? (
                  <div className="mt-2 flex min-w-0 items-center overflow-hidden">
                    <GovernanceProposalOnChainRefLabel
                      presentation={presentation}
                    />
                  </div>
                ) : null}
                <pre className="mt-2 overflow-x-auto rounded-[1rem] border border-border/30 bg-background/70 p-4 text-xs leading-6">
                  <code>{renderHighlightedJson(rawDaoProposal)}</code>
                </pre>
              </GovernanceCollapsiblePanel>
            )}

            <GovernanceGuardianActions
              accountId={accountId}
              connectedRole={connectedRole}
              guardianDecisionSummary={guardianDecisionSummary}
              canApprove={canApprove}
              canReject={canReject}
              canRemove={canRemove}
              canFinalize={canFinalize}
              finalizeLabel={finalizeLabel}
              currentVote={currentVote}
              actionLoading={actionLoading}
              onAction={(action) => {
                void handleGovernanceAction(action);
              }}
              onAdvancedRemove={handleAdvancedRemove}
              resolvedOutcomeLabel={resolvedOutcomeLabel}
              proposalTxHref={proposalTxHref}
              onsocialTelegramUrl={ONSOCIAL_TELEGRAM_URL}
            />
          </div>
        )}

        {!daoLoading && !liveProposal && proposal && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Live proposal could not be loaded.</span>
            {proposal.proposal_id !== null && (
              <span className="font-mono">#{proposal.proposal_id}</span>
            )}
            {fallbackProposalHref && (
              <a
                href={fallbackProposalHref}
                target="_blank"
                rel="noreferrer"
                className="portal-action-link inline-flex items-center gap-1.5 font-medium"
              >
                View submission
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        <ShareProposal
          appId={app.app_id}
          label={presentation.headline}
          proposalId={liveProposalId}
        />
      </SurfacePanel>
    </>
  );
}
