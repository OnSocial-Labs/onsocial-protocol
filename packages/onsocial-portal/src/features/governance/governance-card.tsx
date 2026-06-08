'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { cardDividerSection } from '@/components/ui/card-divider';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { cn } from '@/lib/utils';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import {
  ApprovedConfigPanel,
  GovernanceStatusPanel,
} from '@/features/governance/governance-status-panels';
import { actOnGovernanceProposal } from '@/features/governance/api';
import { reopenApplication } from '@/features/partners/api';
import {
  applyOptimisticGovernanceVote,
  DAO_STATUS_STYLES,
  deriveGovernanceCardView,
  formatActionLabel,
  formatIsoTimestamp,
  HoverTimestamp,
  renderHighlightedJson,
  resolvePartnerWalletFromProposal,
  safeJsonStringify,
  mergeGovernanceProposalSnapshot,
} from '@/features/governance/governance-card-helpers';
import {
  refreshGovernanceProposalAfterAction,
  useGovernanceCardDaoState,
} from '@/features/governance/use-governance-card-dao-state';
import {
  GovernanceCardSkeleton,
  GovernanceCardVoteSkeleton,
  GovernanceCollapsiblePanel,
  GovernanceGuardianActions,
  GovernanceLiveSummary,
  GovernanceReviewTerms,
  GovernanceVoteActivity,
  PartnerProposalSocialLinks,
  ShareProposal,
} from '@/features/governance/governance-card-sections';
import type {
  Application,
  GovernanceDaoAction,
  GovernanceDaoPolicy,
} from '@/features/governance/types';
import type { OnChainAppConfig } from '@/lib/near-rpc';
import { fetchRewardsAppConfig } from '@/features/governance/api';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { prefetchGovernanceCardAccounts } from '@/features/governance/governance-account-chip';
import { GovernanceDescriptionClamp } from '@/features/governance/governance-description-clamp';
import {
  GovernanceProposalOnChainRefLabel,
  GovernanceProposalSummary,
  GovernanceProposerRow,
} from '@/features/governance/governance-proposal-identity-row';
import {
  derivePartnerCardDescription,
  deriveProposalPresentationFromDaoProposal,
  resolveBootstrapDaoProposal,
} from '@/features/governance/governance-proposal-presentation';
import { ProtocolGovernanceCard } from '@/features/governance/protocol-governance-card';
import {
  GOVERNANCE_CARD_INTERACTIVE_LAYER_CLASS,
  GovernanceCardNavigationLink,
} from '@/features/governance/governance-card-interaction';
import { isNearNamedAccountComplete } from '@/lib/portal-near-account';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import { portalCollapseMotion } from '@/features/governance/governance-motion';
import { GovernanceProposalStrip } from '@/features/governance/governance-proposal-strip';

const POST_ACTION_REFRESH_WINDOW_MS = 20_000;
const ONSOCIAL_TELEGRAM_URL = 'https://t.me/onsocialprotocol';

function governanceCardStyle(stripColor: string): CSSProperties {
  return {
    borderLeftColor: stripColor,
    borderTopColor: stripColor,
    '--_accent-border': stripColor,
  } as CSSProperties;
}

export function GovernanceCard({
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
  if (app.governance_scope === 'protocol') {
    return (
      <ProtocolGovernanceCard
        app={app}
        feedDaoPolicy={feedDaoPolicy}
        onGovernanceUpdated={onGovernanceUpdated}
        interactive={interactive}
      />
    );
  }

  return (
    <PartnerGovernanceCard
      app={app}
      feedDaoPolicy={feedDaoPolicy}
      onGovernanceUpdated={onGovernanceUpdated}
      interactive={interactive}
    />
  );
}

function PartnerGovernanceCard({
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
  const proposalHref = buildGovernanceProposalPath(
    app.app_id,
    app.governance_proposal?.proposal_id ?? null
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(false);
  const [actionLoading, setActionLoading] =
    useState<GovernanceDaoAction | null>(null);
  const [actionTxHash, setActionTxHash] = useState<string | null>(null);
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenState, setReopenState] = useState<
    'idle' | 'opened' | 'already-opened'
  >('idle');
  const [postActionRefreshUntil, setPostActionRefreshUntil] = useState<
    number | null
  >(null);
  const [confirmedAction, setConfirmedAction] =
    useState<GovernanceDaoAction | null>(null);
  const [rawProposalOpen, setRawProposalOpen] = useState(false);
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const proposal = app.governance_proposal;
  const proposalFallbackStyle = proposal?.status
    ? DAO_STATUS_STYLES[proposal.status]
    : undefined;
  const {
    daoAccountId,
    liveProposalId,
    hasDaoSource,
    daoPolicy,
    liveProposal,
    daoLoading,
    daoSettled,
    setDaoPolicy,
    setLiveProposal,
  } = useGovernanceCardDaoState({
    proposal,
    feedDaoPolicy,
    postActionRefreshUntil,
    onPostActionRefreshComplete: () => setPostActionRefreshUntil(null),
  });
  const isAppWalletViewer =
    !!accountId &&
    !!app.wallet_id &&
    accountId.toLowerCase() === app.wallet_id.toLowerCase();

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

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      if (app.status !== 'proposal_submitted' && app.status !== 'approved') {
        if (!cancelled) {
          setOnChainConfig(null);
          setConfigLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setConfigLoading(true);
      }

      try {
        const config = await fetchRewardsAppConfig(app.app_id);
        if (!cancelled) {
          setOnChainConfig(config);
        }
      } catch {
        if (!cancelled) {
          setOnChainConfig(null);
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
        }
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, [app.app_id, app.status]);

  useEffect(() => {
    setReopenState('idle');
  }, [app.app_id, app.status]);

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
    rewardPerActionValue,
    dailyCapValue,
    dailyBudgetValue,
    totalBudgetValue,
    attachedDepositValue,
    authorizedCallers,
    proposalSummaryText,
    proposalTxHref,
    latestActionLink,
    resolvedOutcomeLabel,
    guardianDecisionSummary: rawGuardianDecisionSummary,
    showUsageMetrics,
    finalizeLabel,
    showVoteRule,
  } = deriveGovernanceCardView({
    accountId,
    isConnected,
    daoPolicy,
    liveProposal,
    proposal,
    actionTxHash,
    isAppWalletViewer,
    nowMs,
  });

  const canReopen =
    !!connectedRole && app.status === 'rejected' && reopenState === 'idle';
  const guardianDecisionSummary =
    reopenState === 'opened' || app.status === 'reopened'
      ? { title: 'Reapply is open', toneClass: 'portal-green-text' }
      : reopenState === 'already-opened'
        ? {
            title: 'Already open for reapply',
            toneClass: 'portal-green-text',
          }
        : canReopen
          ? { title: 'Let them reapply', toneClass: 'portal-blue-text' }
          : rawGuardianDecisionSummary;

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

  async function handleReopen() {
    if (!accountId) return;
    setReopenLoading(true);
    clearTxResult();
    try {
      const result = await reopenApplication(app.app_id, accountId);
      setReopenState(result.already_reopened ? 'already-opened' : 'opened');
      setTxResult({
        type: 'success',
        msg: result.already_reopened
          ? 'Already open for reapply.'
          : 'Reapply opened.',
      });
      await onGovernanceUpdated?.();
    } catch (error) {
      setTxResult({
        type: 'error',
        msg: error instanceof Error ? error.message : 'Reopen failed.',
      });
    } finally {
      setReopenLoading(false);
    }
  }

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
    (app.status === 'approved'
      ? 'var(--portal-green-border-strong)'
      : app.status === 'rejected'
        ? 'var(--portal-red-border-strong)'
        : 'var(--portal-blue-border-strong)');

  const fallbackBadgeBg =
    app.status === 'approved'
      ? 'bg-[var(--portal-green-bg)]'
      : 'bg-[var(--portal-red-bg)]';
  const fallbackBadgeText =
    app.status === 'approved' ? 'portal-green-text' : 'portal-red-text';
  const fallbackMetaLabel = app.status === 'approved' ? 'Approved' : 'Rejected';
  const fallbackMetaTime = formatIsoTimestamp(app.reviewed_at);

  const presentation = useMemo(() => {
    const base = deriveProposalPresentationFromDaoProposal(
      liveProposal ?? resolveBootstrapDaoProposal(proposal),
      {
        label: app.label,
        description: app.description ?? proposal?.description,
      }
    );

    if (base.actionBadge !== 'Partner') {
      return base;
    }

    const walletId = resolvePartnerWalletFromProposal(
      app.wallet_id,
      liveProposal
    );
    const subjectCandidate = base.subjectAccount?.trim() || '';
    const subjectAccount =
      walletId ??
      (subjectCandidate && isNearNamedAccountComplete(subjectCandidate)
        ? subjectCandidate
        : null);
    const proposer = base.proposer?.trim() ?? null;

    return {
      ...base,
      subjectAccount,
      targetKind: 'community' as const,
      targetValue: app.label,
      showProposerSeparately:
        !!proposer &&
        !!subjectAccount &&
        proposer.toLowerCase() !== subjectAccount.toLowerCase(),
    };
  }, [
    liveProposal,
    liveProposalId,
    app.label,
    app.description,
    app.wallet_id,
    app.app_id,
    proposal?.description,
  ]);

  const resolvedPartnerWallet = resolvePartnerWalletFromProposal(
    app.wallet_id,
    liveProposal
  );

  useEffect(() => {
    if (!liveProposal) {
      return;
    }

    prefetchGovernanceCardAccounts([
      resolvedPartnerWallet,
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
    resolvedPartnerWallet,
    voteEntries,
  ]);

  const descriptionText =
    presentation.actionBadge === 'Partner'
      ? derivePartnerCardDescription({
          appDescription: app.description,
          onChainDescription: presentation.onChainDescription,
        })
      : presentation.onChainDescription;

  if (!daoSettled && hasDaoSource) {
    return <GovernanceCardSkeleton />;
  }

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
          {liveProposalId !== null ? (
            <GovernanceProposalStrip
              proposalId={liveProposalId}
              actionBadge={presentation.actionBadge}
              submissionTime={submissionTime}
              statusStyle={liveStatusStyle ?? proposalFallbackStyle ?? null}
              reviewExpiry={reviewExpiry}
              interactive={interactive}
            />
          ) : (
            (app.status === 'approved' || app.status === 'rejected') && (
              <div
                className={`-mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-4 flex items-center justify-between gap-2 rounded-t-[calc(1.5rem-1px)] px-5 md:px-6 py-2.5 pb-4 font-mono portal-type-body-sm ${fallbackBadgeBg}`}
                style={{
                  maskImage:
                    'linear-gradient(to bottom, black 70%, transparent)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, black 70%, transparent)',
                }}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  {fallbackMetaTime && (
                    <HoverTimestamp
                      relative={fallbackMetaTime.relative}
                      absolute={fallbackMetaTime.absolute}
                    />
                  )}
                </div>
                <span
                  className={`inline-flex items-center justify-end gap-1.5 portal-type-label font-semibold uppercase tracking-wide ${fallbackBadgeText}`}
                >
                  {fallbackMetaLabel}
                  {interactive && (
                    <ProtocolMotionArrow
                      groupName="card"
                      resetOnNestedInteractiveHover
                      className="h-3 w-3"
                    />
                  )}
                </span>
              </div>
            )
          )}
          <div className="space-y-3 pb-3">
            <GovernanceProposalSummary
              presentation={presentation}
              className={
                interactive
                  ? 'transition-opacity group-hover/card:opacity-90'
                  : undefined
              }
              targetFooter={
                <PartnerProposalSocialLinks
                  websiteUrl={app.website_url}
                  telegramHandle={app.telegram_handle}
                  xHandle={app.x_handle}
                  className="mt-1.5 justify-end"
                />
              }
            />

            {presentation.showProposerSeparately && presentation.proposer ? (
              <GovernanceProposerRow proposer={presentation.proposer} />
            ) : null}

            {descriptionText ? (
              <GovernanceDescriptionClamp text={descriptionText} />
            ) : null}
          </div>

          {!liveProposal && (
            <div className="pt-4">
              <GovernanceStatusPanel
                appId={app.app_id}
                proposal={proposal}
                creationStatus="idle"
                creationError=""
              />
            </div>
          )}

          {daoLoading && liveProposalId !== null && (
            <div className={cn('mt-3 border-t pt-3', cardDividerSection)}>
              <GovernanceCardVoteSkeleton className="mt-0" />
            </div>
          )}

          <AnimatePresence initial={false}>
            {!daoLoading && liveProposal && liveStatusStyle && (
              <motion.div
                key="live-summary"
                {...portalCollapseMotion}
                className="overflow-hidden"
              >
                <div
                  className={cn(
                    'mt-3 space-y-3 border-t pt-3',
                    cardDividerSection
                  )}
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
                      reviewExpiry={reviewExpiry}
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

                  {functionCallSummary && (
                    <GovernanceReviewTerms
                      functionCallSummary={functionCallSummary}
                      proposalSummaryText={proposalSummaryText}
                      rewardPerActionValue={rewardPerActionValue}
                      dailyCapValue={dailyCapValue}
                      dailyBudgetValue={dailyBudgetValue}
                      totalBudgetValue={totalBudgetValue}
                      attachedDepositValue={attachedDepositValue}
                      authorizedCallers={authorizedCallers}
                    />
                  )}

                  {rawDaoProposal && (
                    <GovernanceCollapsiblePanel
                      label="Raw proposal"
                      isOpen={rawProposalOpen}
                      onToggle={() => setRawProposalOpen((open) => !open)}
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
                    canReopen={canReopen}
                    reopenLoading={reopenLoading}
                    onReopen={() => {
                      void handleReopen();
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {(app.status === 'proposal_submitted' ||
            app.status === 'approved') && (
            <ApprovedConfigPanel
              configLoading={configLoading}
              onChainConfig={onChainConfig}
              showUsageMetrics={showUsageMetrics}
            />
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
