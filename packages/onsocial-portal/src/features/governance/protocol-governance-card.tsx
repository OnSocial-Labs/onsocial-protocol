'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import { cardDividerSection } from '@/components/ui/card-divider';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { cn } from '@/lib/utils';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import { actOnGovernanceProposal } from '@/features/governance/api';
import {
  applyOptimisticGovernanceVote,
  DAO_STATUS_STYLES,
  deriveGovernanceCardView,
  formatActionLabel,
  renderHighlightedJson,
  formatGovernanceDaoProposalForRawDisplay,
  mergeGovernanceProposalSnapshot,
} from '@/features/governance/governance-card-helpers';
import {
  refreshGovernanceProposalAfterAction,
  useGovernanceCardDaoState,
} from '@/features/governance/use-governance-card-dao-state';
import { prefetchGovernanceCardAccounts } from '@/features/governance/governance-account-chip';
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
  GovernanceProposerRow,
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
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import {
  GOVERNANCE_CARD_INTERACTIVE_LAYER_CLASS,
  GovernanceCardNavigationLink,
} from '@/features/governance/governance-card-interaction';
import {
  buildGovernancePathWithBoard,
  resolveGovernanceDaoBoard,
} from '@/features/governance/governance-dao-board';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';

const POST_ACTION_REFRESH_WINDOW_MS = 20_000;
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
  const proposalHref = buildGovernancePathWithBoard(
    buildGovernanceProposalPath(
      app.app_id,
      app.governance_proposal?.proposal_id ?? null
    ).split('?')[0] ?? '/governance',
    resolveGovernanceDaoBoard(app.governance_proposal?.dao_account),
    app.governance_proposal?.proposal_id != null
      ? { proposal: String(app.governance_proposal.proposal_id) }
      : undefined
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
    if (!liveProposal) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [liveProposal?.status, liveProposal?.resolved_at]);

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
    statusSubtitle,
    statusSummary,
    functionCallSummary,
    proposalTxHref,
    latestActionLink,
    resolvedOutcomeLabel,
    guardianDecisionSummary,
    finalizeLabel,
    showVoteRule,
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
        submittedMessage: txToastGovPending.actionSubmitted(
          formatActionLabel(action)
        ),
        successMessage: txToastGovSuccess.actionConfirmed(
          formatActionLabel(action)
        ),
        failureMessage: txToastGovError.actionFailed(formatActionLabel(action)),
      });

      if (!confirmed) {
        return;
      }

      if (
        action === 'VoteApprove' ||
        action === 'VoteReject' ||
        action === 'VoteRemove'
      ) {
        setLiveProposal(
          applyOptimisticGovernanceVote({
            proposal: liveProposal,
            accountId,
            action,
            daoPolicy,
          })
        );
      }

      setConfirmedAction(action);
      setTimeout(() => setConfirmedAction(null), 3000);
      setPostActionRefreshUntil(Date.now() + POST_ACTION_REFRESH_WINDOW_MS);

      void (async () => {
        try {
          const { policy, proposal: nextProposal } =
            await refreshGovernanceProposalAfterAction({
              daoAccountId,
              proposalId: liveProposalId,
              feedDaoPolicy,
            });
          setDaoPolicy(policy);
          setLiveProposal((current) =>
            mergeGovernanceProposalSnapshot(current, nextProposal)
          );
          void onGovernanceUpdated?.();
        } catch {
          setTxResult({
            type: 'error',
            msg: 'Action confirmed but DAO state failed to refresh.',
          });
        }
      })();
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
    },
    { protocolKind: app.protocol_kind ?? null }
  );

  useEffect(() => {
    if (!liveProposal) {
      return;
    }

    prefetchGovernanceCardAccounts([
      presentation.subjectAccount,
      presentation.proposer,
      ...voteEntries.map(([voterAccount]) => voterAccount),
      ...(eligibleVoterAccounts ?? []),
    ]);
  }, [
    eligibleVoterAccounts,
    liveProposal,
    presentation.proposer,
    presentation.subjectAccount,
    voteEntries,
  ]);
  const fallbackProposalHref = proposal?.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${proposal.tx_hash}`
    : null;
  const rawDaoProposal = liveProposal
    ? formatGovernanceDaoProposalForRawDisplay(liveProposal, liveProposalId)
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
      >
        {interactive ? (
          <GovernanceCardNavigationLink
            href={proposalHref}
            label={`View proposal ${app.label}`}
          />
        ) : null}
        <div className={GOVERNANCE_CARD_INTERACTIVE_LAYER_CLASS}>
          {liveProposalId !== null && (
            <GovernanceProposalStrip
              proposalId={liveProposalId}
              actionBadge={presentation.actionBadge}
              submissionTime={submissionTime}
              statusStyle={liveStatusStyle ?? proposalFallbackStyle ?? null}
              statusSubtitle={statusSubtitle}
              interactive={interactive}
            />
          )}
          <div className="space-y-3 pb-3">
            <GovernanceProposalSummary
              presentation={presentation}
              className={
                interactive
                  ? 'transition-opacity group-hover/card:opacity-90'
                  : undefined
              }
            />

            {(presentation.showProposerSeparately && presentation.proposer) ||
            presentation.showProposerAsSelf ? (
              <GovernanceProposerRow
                proposer={presentation.proposer ?? undefined}
                asSelf={presentation.showProposerAsSelf}
              />
            ) : null}

            {presentation.onChainDescription ? (
              <GovernanceDescriptionClamp
                text={presentation.onChainDescription}
              />
            ) : null}
          </div>

          {daoLoading && liveProposalId !== null && (
            <div className={cn('mt-3 border-t pt-3', cardDividerSection)}>
              <GovernanceCardVoteSkeleton className="mt-0" />
            </div>
          )}

          {!daoLoading && liveProposal && liveStatusStyle && (
            <div
              className={cn('mt-3 space-y-3 border-t pt-3', cardDividerSection)}
            >
              <div className="space-y-2">
                <GovernanceLiveSummary
                  liveProposal={liveProposal}
                  liveProposalId={liveProposalId}
                  liveStatusStyle={liveStatusStyle}
                  statusSummary={statusSummary}
                  currentVote={currentVote}
                  resolvedOutcomeLabel={resolvedOutcomeLabel}
                  functionCallSummary={functionCallSummary}
                  submissionTime={submissionTime}
                  statusSubtitle={statusSubtitle}
                  votingProgress={votingProgress}
                  activeVotingRole={activeVotingRole}
                  rejectVotes={rejectVotes}
                  removeVotes={removeVotes}
                  approveVotes={approveVotes}
                  confirmedAction={confirmedAction}
                  showVoteRule={showVoteRule}
                />

                <GovernanceVoteActivity
                  voteEntries={voteEntries}
                  accountId={accountId}
                  latestActionLink={latestActionLink}
                  activeVotingRole={activeVotingRole}
                  eligibleVoterAccounts={eligibleVoterAccounts}
                  defaultExpanded={!interactive}
                />
              </div>

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
        </div>
      </SurfacePanel>
    </>
  );
}
