'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Globe } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import {
  ApprovedConfigPanel,
  GovernanceStatusPanel,
} from '@/features/governance/governance-status-panels';
import { actOnGovernanceProposal } from '@/features/governance/api';
import { reopenApplication } from '@/features/partners/api';
import {
  buildHandleUrl,
  DAO_STATUS_STYLES,
  deriveGovernanceCardView,
  formatActionLabel,
  formatIsoTimestamp,
  HoverTimestamp,
  loadLiveDaoState,
  renderHighlightedJson,
  safeJsonStringify,
} from '@/features/governance/governance-card-helpers';
import {
  GovernanceGuardianActions,
  GovernanceLiveSummary,
  GovernanceReviewTerms,
  GovernanceVoteActivity,
  ShareProposal,
} from '@/features/governance/governance-card-sections';
import type {
  Application,
  GovernanceDaoAction,
  GovernanceDaoPolicy,
  GovernanceDaoProposal,
  GovernanceProposal,
} from '@/features/governance/types';
import { viewContract, type OnChainAppConfig } from '@/lib/near-rpc';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { ProtocolGovernanceCard } from '@/features/governance/protocol-governance-card';

const POST_ACTION_REFRESH_MS = 5_000;
const POST_ACTION_REFRESH_WINDOW_MS = 60_000;
const ONSOCIAL_TELEGRAM_URL = 'https://t.me/onsocialprotocol';

function DescriptionClamp({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(true);
  const [needsClamp, setNeedsClamp] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div className="mt-1.5">
      <AnimatePresence initial={false}>
        <motion.div
          key={clamped ? 'clamped' : 'expanded'}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="overflow-hidden"
        >
          <p
            ref={ref}
            className={`max-w-3xl text-xs text-muted-foreground ${clamped ? 'line-clamp-2' : ''}`}
          >
            {text}
          </p>
        </motion.div>
      </AnimatePresence>
      {needsClamp && (
        <button
          type="button"
          onClick={() => setClamped((c) => !c)}
          className="mt-0.5 text-xs text-foreground/50 hover:text-foreground/70"
        >
          {clamped ? 'show more' : 'show less'}
        </button>
      )}
    </div>
  );
}

export function GovernanceCard({
  app,
  onGovernanceUpdated,
}: {
  app: Application;
  onGovernanceUpdated?: () => void | Promise<void>;
}) {
  if (app.governance_scope === 'protocol') {
    return (
      <ProtocolGovernanceCard
        app={app}
        onGovernanceUpdated={onGovernanceUpdated}
      />
    );
  }

  return (
    <PartnerGovernanceCard
      app={app}
      onGovernanceUpdated={onGovernanceUpdated}
    />
  );
}

function PartnerGovernanceCard({
  app,
  onGovernanceUpdated,
}: {
  app: Application;
  onGovernanceUpdated?: () => void | Promise<void>;
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
      router.push(`/governance/${encodeURIComponent(app.app_id)}`);
    },
    [router, app.app_id]
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(false);
  const [daoPolicy, setDaoPolicy] = useState<GovernanceDaoPolicy | null>(null);
  const [liveProposal, setLiveProposal] =
    useState<GovernanceDaoProposal | null>(null);
  const [daoLoading, setDaoLoading] = useState(false);
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
  const [rawProposalOpen, setRawProposalOpen] = useState(false);
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const proposal: GovernanceProposal | null = app.governance_proposal;
  const proposalFallbackStyle = proposal?.status
    ? DAO_STATUS_STYLES[proposal.status]
    : undefined;
  const daoAccountId = proposal?.dao_account ?? null;
  const liveProposalId = proposal?.proposal_id ?? null;
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
        const config = await viewContract<OnChainAppConfig>('get_app_config', {
          app_id: app.app_id,
        });
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
    let cancelled = false;

    async function loadDaoState() {
      if (!daoAccountId || liveProposalId === null) {
        if (!cancelled) {
          setDaoPolicy(null);
          setLiveProposal(null);
          setDaoLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setDaoLoading(true);
      }

      try {
        const { policy, proposal: nextProposal } = await loadLiveDaoState(
          daoAccountId,
          liveProposalId
        );
        if (!cancelled) {
          setDaoPolicy(policy);
          setLiveProposal(nextProposal);
        }
      } finally {
        if (!cancelled) {
          setDaoLoading(false);
        }
      }
    }

    void loadDaoState();

    return () => {
      cancelled = true;
    };
  }, [daoAccountId, liveProposalId]);

  useEffect(() => {
    if (!daoAccountId || liveProposalId === null || !postActionRefreshUntil) {
      return;
    }

    const resolvedDaoAccountId = daoAccountId;
    const resolvedProposalId = liveProposalId;
    const refreshUntil = postActionRefreshUntil;

    if (Date.now() >= refreshUntil) {
      setPostActionRefreshUntil(null);
      return;
    }

    let cancelled = false;

    async function refreshLiveDaoState() {
      try {
        const { policy, proposal: nextProposal } = await loadLiveDaoState(
          resolvedDaoAccountId,
          resolvedProposalId
        );
        if (!cancelled) {
          setDaoPolicy(policy);
          setLiveProposal(nextProposal);
        }
      } finally {
        if (!cancelled) {
          if (Date.now() + POST_ACTION_REFRESH_MS >= refreshUntil) {
            setPostActionRefreshUntil(null);
          }
        }
      }
    }

    const timer = window.setInterval(() => {
      void refreshLiveDaoState();
    }, POST_ACTION_REFRESH_MS);

    void refreshLiveDaoState();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [daoAccountId, liveProposalId, postActionRefreshUntil]);

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
    if (!wallet || !daoAccountId || liveProposalId === null || !liveProposal) {
      setTxResult({
        type: 'error',
        msg: 'Connect an authorized guardian wallet to continue.',
      });
      return;
    }

    setActionLoading(action);
    clearTxResult();
    setActionTxHash(null);

    try {
      const txHash = await actOnGovernanceProposal(
        wallet,
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
        submittedMessage: `Your ${formatActionLabel(action)} was submitted. Confirming on-chain.`,
        successMessage: `Your ${formatActionLabel(action)} was confirmed on-chain.`,
        failureMessage: `Your ${formatActionLabel(action)} failed on-chain.`,
      });

      if (!confirmed) {
        return;
      }

      try {
        const { policy, proposal: nextProposal } = await loadLiveDaoState(
          daoAccountId,
          liveProposalId
        );
        setDaoPolicy(policy);
        setLiveProposal(nextProposal);
        await onGovernanceUpdated?.();
      } catch {
        setTxResult({
          type: 'error',
          msg: 'Governance action confirmed on-chain, but live DAO refresh failed.',
        });
      }

      setPostActionRefreshUntil(Date.now() + POST_ACTION_REFRESH_WINDOW_MS);
    } catch (error) {
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error ? error.message : 'Governance action failed',
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
          ? 'Reapply is already open for this application.'
          : 'Reapply is open. The applicant can submit again now.',
      });
      await onGovernanceUpdated?.();
    } catch (error) {
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : 'Failed to reopen application',
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

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel
        id={app.app_id}
        radius="xl"
        tone="solid"
        borderTone="strong"
        padding="roomy"
        className="relative cursor-pointer overflow-hidden border-l-[3px] border-t-[3px] transition-[transform,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-lg shadow-[0_1px_0_rgba(255,255,255,0.02)_inset]"
        style={{ borderLeftColor: stripColor, borderTopColor: stripColor }}
        onClick={handleCardClick}
      >
        {liveProposalId !== null ? (
          <div
            className={`-mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-4 flex items-center justify-between gap-2 rounded-t-[calc(1.5rem-1px)] px-5 md:px-6 py-2.5 pb-4 font-mono text-xs ${liveStatusStyle?.badgeBg ?? proposalFallbackStyle?.badgeBg ?? 'bg-[var(--portal-blue-bg)]'}`}
            style={{
              maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to bottom, black 70%, transparent)',
            }}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span
                className={`shrink-0 font-semibold ${liveStatusStyle?.badgeText ?? proposalFallbackStyle?.badgeText ?? 'portal-blue-text'}`}
              >
                #{liveProposalId}
              </span>
              {functionCallSummary?.methodName && (
                <>
                  <span className="shrink-0 text-foreground/20">·</span>
                  <span className="break-all font-medium text-foreground/60">
                    {functionCallSummary.methodName}
                  </span>
                </>
              )}
              {submissionTime && (
                <>
                  <span className="shrink-0 text-foreground/20">·</span>
                  <HoverTimestamp
                    relative={submissionTime.relative}
                    absolute={submissionTime.absolute}
                  />
                </>
              )}
            </div>
            {liveStatusStyle && (
              <div className="shrink-0 text-right">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide ${liveStatusStyle.badgeText}`}
                >
                  {liveStatusStyle.label}
                </span>
                {reviewExpiry && (
                  <div
                    className={`mt-0.5 text-[10px] ${reviewExpiry.expired ? 'portal-amber-text' : 'text-muted-foreground'}`}
                  >
                    <HoverTimestamp
                      relative={reviewExpiry.relative}
                      absolute={reviewExpiry.absolute}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          (app.status === 'approved' || app.status === 'rejected') && (
            <div
              className={`-mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-4 flex items-center justify-between gap-2 rounded-t-[calc(1.5rem-1px)] px-5 md:px-6 py-2.5 pb-4 font-mono text-xs ${fallbackBadgeBg}`}
              style={{
                maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
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
                className={`text-[11px] font-semibold uppercase tracking-wide ${fallbackBadgeText}`}
              >
                {fallbackMetaLabel}
              </span>
            </div>
          )
        )}
        <div className="border-b border-fade-section pb-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={`/governance/${encodeURIComponent(app.app_id)}`}
              className="group"
            >
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground transition-colors group-hover:text-foreground/80">
                {app.label}
              </h3>
            </Link>
            {(app.website_url || app.telegram_handle || app.x_handle) && (
              <div className="flex items-center gap-2">
                {app.website_url && (
                  <a
                    href={app.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Website"
                    className="text-muted-foreground transition-all hover:text-[var(--portal-green)] hover:brightness-125 hover:scale-110"
                  >
                    <Globe className="h-[18px] w-[18px]" />
                  </a>
                )}
                {app.telegram_handle && (
                  <a
                    href={buildHandleUrl(app.telegram_handle, 'telegram')}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Telegram"
                    className="text-muted-foreground transition-all hover:text-[#26A5E4] hover:brightness-125 hover:scale-110"
                  >
                    <RiTelegram2Line className="h-[18px] w-[18px]" />
                  </a>
                )}
                {app.x_handle && (
                  <a
                    href={buildHandleUrl(app.x_handle, 'x')}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="X"
                    className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
                  >
                    <FaXTwitter className="h-[18px] w-[18px]" />
                  </a>
                )}
              </div>
            )}
          </div>
          <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
            {app.app_id}
            {app.wallet_id && app.wallet_id !== app.app_id && (
              <>
                <span className="mx-1 text-border/50">·</span>
                {app.wallet_id}
              </>
            )}
          </p>

          {app.description && <DescriptionClamp text={app.description} />}
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
          <p className="mt-4 text-xs text-muted-foreground">
            Fetching live review status…
          </p>
        )}

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
            />

            <GovernanceVoteActivity
              voteEntries={voteEntries}
              accountId={accountId}
              latestActionLink={latestActionLink}
              activeVotingRole={activeVotingRole}
            />

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
              <div className="mt-3 border-t border-fade-detail pt-3">
                <button
                  type="button"
                  onClick={() => setRawProposalOpen((open) => !open)}
                  aria-expanded={rawProposalOpen}
                  className="group -mx-1 flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-foreground/[0.03]"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-foreground/80">
                    Raw proposal
                  </p>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground/80 ${rawProposalOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {rawProposalOpen ? (
                    <motion.div
                      key="raw-proposal"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <pre className="mt-3 overflow-x-auto rounded-[1rem] border border-border/30 bg-background/70 p-4 text-xs leading-6">
                        <code>{renderHighlightedJson(rawDaoProposal)}</code>
                      </pre>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
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
        )}

        {(app.status === 'proposal_submitted' || app.status === 'approved') && (
          <ApprovedConfigPanel
            configLoading={configLoading}
            onChainConfig={onChainConfig}
            showUsageMetrics={showUsageMetrics}
          />
        )}

        <ShareProposal appId={app.app_id} label={app.label} />
      </SurfacePanel>
    </>
  );
}
