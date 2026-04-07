'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Link2,
  Mail,
  RotateCcw,
  Share2,
  XCircle,
  Vote,
} from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import { Button } from '@/components/ui/button';
import {
  getCounterToneClass,
  getVoteToneClass,
} from '@/features/governance/governance-card-helpers';
import type {
  GovernanceDaoAction,
  GovernanceDaoProposal,
  GovernanceDaoRole,
} from '@/features/governance/types';

type LiveStatusStyle = {
  stripClass: string;
  textClass: string;
  label: string;
  barClass: string;
};

type VotingProgress = {
  threshold: number | null;
  totalWeight: number | null;
  approvals: number;
  rejects: number;
  removes: number;
  votesCast: number;
  remainingVoters: number | null;
  remaining: number | null;
  approvalStillPossible: boolean | null;
};

type FunctionCallSummary = {
  receiverId: string;
  methodName: string;
  deposit: string | null;
  gas: string | null;
  config: Record<string, unknown> | null;
};

function formatRoleLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function GovernanceLiveSummary({
  liveProposal,
  liveProposalId: _liveProposalId,
  liveStatusStyle,
  statusSummary: _statusSummary,
  currentVote: _currentVote,
  resolvedOutcomeLabel,
  functionCallSummary: _functionCallSummary,
  submissionTime: _submissionTime,
  reviewExpiry: _reviewExpiry,
  votingProgress,
  activeVotingRole: _activeVotingRole,
  rejectVotes,
  removeVotes,
  approveVotes,
  confirmedAction = null,
}: {
  liveProposal: GovernanceDaoProposal;
  liveProposalId: number | null;
  liveStatusStyle: LiveStatusStyle;
  statusSummary: string | null;
  currentVote: string | null;
  resolvedOutcomeLabel: string | null;
  functionCallSummary: FunctionCallSummary | null;
  submissionTime: { relative: string; absolute: string } | null;
  reviewExpiry: { relative: string; absolute: string; expired: boolean } | null;
  votingProgress: VotingProgress;
  activeVotingRole: GovernanceDaoRole | null;
  rejectVotes: string;
  removeVotes: string;
  approveVotes: string;
  confirmedAction?: 'VoteApprove' | 'VoteReject' | 'VoteRemove' | 'Finalize' | null;
}) {
  const totalWeight = votingProgress.totalWeight ?? 0;
  const isResolved = Boolean(resolvedOutcomeLabel);
  const pulseApprove = confirmedAction === 'VoteApprove';
  const pulseReject = confirmedAction === 'VoteReject';
  const pulseRemove = confirmedAction === 'VoteRemove';
  const approvePercent =
    totalWeight > 0 ? (votingProgress.approvals / totalWeight) * 100 : 0;
  const rejectPercent =
    totalWeight > 0 ? (votingProgress.rejects / totalWeight) * 100 : 0;
  const removePercent =
    totalWeight > 0 ? (votingProgress.removes / totalWeight) * 100 : 0;
  const pendingPercent =
    totalWeight > 0
      ? Math.max(100 - approvePercent - rejectPercent - removePercent, 0)
      : 0;
  const resolvedPrimaryValue =
    liveProposal.status === 'Approved'
      ? `${approveVotes}/${votingProgress.totalWeight ?? '0'}`
      : liveProposal.status === 'Rejected'
        ? `${rejectVotes}/${votingProgress.totalWeight ?? '0'}`
        : liveProposal.status === 'Removed'
          ? `${removeVotes}/${votingProgress.totalWeight ?? '0'}`
          : `${votingProgress.votesCast}/${votingProgress.totalWeight ?? '0'}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span
            className={`inline-flex items-center gap-1 transition-all duration-500 ${getCounterToneClass('approve', approveVotes)} ${pulseApprove ? 'scale-110 brightness-125' : ''}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{approveVotes}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 transition-all duration-500 ${getCounterToneClass('reject', rejectVotes)} ${pulseReject ? 'scale-110 brightness-125' : ''}`}
          >
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{rejectVotes}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 transition-all duration-500 ${getCounterToneClass('remove', removeVotes)} ${pulseRemove ? 'scale-110 brightness-125' : ''}`}
          >
            <Vote className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{removeVotes}</span>
          </span>
        </div>
        {votingProgress.threshold !== null && (
          <>
            <span className="text-border/40">·</span>
            <span
              className={`font-medium ${isResolved || votingProgress.remaining === 0 ? liveStatusStyle.textClass : votingProgress.approvalStillPossible === false ? 'portal-red-text' : 'text-muted-foreground'}`}
            >
              {isResolved
                ? resolvedPrimaryValue
                : votingProgress.remaining === 0
                  ? 'Ready'
                  : votingProgress.approvalStillPossible === false
                    ? 'Can\u2019t pass'
                    : `${votingProgress.remaining} to go`}
            </span>
          </>
        )}
      </div>

      {votingProgress.threshold !== null &&
        (() => {
          const thresholdPct =
            totalWeight > 0
              ? (votingProgress.threshold / totalWeight) * 100
              : 0;
          const showMarker =
            !isResolved && thresholdPct > 0 && thresholdPct < 100;

          return (
            <div className="relative mt-2">
              <div className="flex h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                {approvePercent > 0 ? (
                  <div
                    className="h-full shrink-0 transition-[width] duration-500 ease-out"
                    style={{
                      width: `${approvePercent}%`,
                      backgroundColor: 'var(--portal-green)',
                    }}
                  />
                ) : null}
                {rejectPercent > 0 ? (
                  <div
                    className="h-full shrink-0 transition-[width] duration-500 ease-out"
                    style={{
                      width: `${rejectPercent}%`,
                      backgroundColor: 'var(--portal-red)',
                    }}
                  />
                ) : null}
                {removePercent > 0 ? (
                  <div
                    className="h-full shrink-0 transition-[width] duration-500 ease-out"
                    style={{
                      width: `${removePercent}%`,
                      backgroundColor: 'var(--portal-amber)',
                    }}
                  />
                ) : null}
                {pendingPercent > 0 ? (
                  <div
                    className="h-full shrink-0 bg-black/10 transition-[width] duration-500 ease-out dark:bg-white/10"
                    style={{ width: `${pendingPercent}%` }}
                  />
                ) : null}
              </div>
              {showMarker && (
                <div
                  className="absolute top-0 h-2 w-px bg-foreground/30"
                  style={{ left: `${thresholdPct}%` }}
                  title={`Threshold: ${votingProgress.threshold}/${totalWeight}`}
                />
              )}
            </div>
          );
        })()}
    </div>
  );
}

export function GovernanceVoteActivity({
  voteEntries,
  accountId,
  latestActionLink,
  activeVotingRole,
}: {
  voteEntries: Array<[string, string]>;
  accountId: string | null | undefined;
  latestActionLink: { label: string; href: string } | null;
  activeVotingRole: GovernanceDaoRole | null;
}) {
  const groupMembers = (activeVotingRole?.kind?.Group ?? []).map((m) =>
    m.toLowerCase()
  );
  const voterSet = new Set(
    voteEntries.map(([account]) => account.toLowerCase())
  );
  const abstainers = groupMembers
    .filter((m) => !voterSet.has(m))
    .sort((a, b) => a.localeCompare(b));

  if (voteEntries.length === 0 && abstainers.length === 0) return null;

  const VOTE_ICONS: Record<string, typeof CheckCircle2> = {
    Approve: CheckCircle2,
    Reject: XCircle,
    Remove: Vote,
  };

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {voteEntries.map(([voterAccount, voterChoice]) => {
        const VoteIcon = VOTE_ICONS[voterChoice] ?? Vote;
        return (
          <div
            key={voterAccount}
            className="inline-flex min-w-0 items-center gap-1.5 text-xs"
          >
            <VoteIcon
              className={`h-3.5 w-3.5 shrink-0 ${getVoteToneClass(voterChoice, accountId === voterAccount)}`}
            />
            <span className="truncate font-mono text-muted-foreground">
              {voterAccount}
            </span>
          </div>
        );
      })}
      {abstainers.map((account) => (
        <div
          key={account}
          className="inline-flex min-w-0 items-center gap-1.5 text-xs"
        >
          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <span className="truncate font-mono text-muted-foreground/50">
            {account}
          </span>
        </div>
      ))}
      {latestActionLink && (
        <a
          href={latestActionLink.href}
          target="_blank"
          rel="noreferrer"
          className="portal-action-link mt-0.5 inline-flex items-center gap-1 text-xs font-medium"
        >
          {latestActionLink.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export function GovernanceReviewTerms({
  functionCallSummary,
  proposalSummaryText: _proposalSummaryText,
  rewardPerActionValue,
  dailyCapValue,
  dailyBudgetValue,
  totalBudgetValue,
  attachedDepositValue,
  authorizedCallers,
}: {
  functionCallSummary: FunctionCallSummary;
  proposalSummaryText: string | null;
  rewardPerActionValue: string | null;
  dailyCapValue: string | null;
  dailyBudgetValue: string | null;
  totalBudgetValue: string | null;
  attachedDepositValue: string | null;
  authorizedCallers: string[];
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-fade-section pt-3">
      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
        className="group -mx-1 flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-foreground/80">
          Terms
        </p>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground/80 ${detailsOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {detailsOpen ? (
          <motion.div
            key="review-terms-details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <dl className="mt-2 space-y-1 text-xs">
              {rewardPerActionValue && (
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">Per Action</dt>
                  <dd className="ml-auto font-mono font-medium text-foreground/80">
                    {rewardPerActionValue}
                  </dd>
                </div>
              )}
              {dailyCapValue && (
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">Daily Cap</dt>
                  <dd className="ml-auto font-mono font-medium text-foreground/80">
                    {dailyCapValue}
                  </dd>
                </div>
              )}
              {dailyBudgetValue && (
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">Daily Budget</dt>
                  <dd className="ml-auto font-mono font-medium portal-blue-text">
                    {dailyBudgetValue}
                  </dd>
                </div>
              )}
              {totalBudgetValue && (
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">Total Budget</dt>
                  <dd className="ml-auto font-mono font-medium portal-blue-text">
                    {totalBudgetValue}
                  </dd>
                </div>
              )}
              {attachedDepositValue && (
                <div className="flex items-baseline gap-2">
                  <dt className="text-muted-foreground">Deposit</dt>
                  <dd className="ml-auto font-mono font-medium text-foreground/80">
                    {attachedDepositValue}
                  </dd>
                </div>
              )}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <dt className="shrink-0 text-muted-foreground">Contract</dt>
                <dd className="ml-auto break-all font-mono font-medium text-foreground/80">
                  {functionCallSummary.receiverId}
                </dd>
              </div>
              {authorizedCallers.length > 0 && (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <dt className="shrink-0 text-muted-foreground">Callers</dt>
                  <dd className="ml-auto break-all font-mono text-foreground/80">
                    {authorizedCallers.join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function GovernanceGuardianActions({
  accountId,
  connectedRole,
  guardianDecisionSummary,
  canApprove,
  canReject,
  canRemove,
  canFinalize,
  finalizeLabel,
  currentVote,
  actionLoading,
  onAction,
  onAdvancedRemove,
  resolvedOutcomeLabel,
  proposalTxHref,
  onsocialTelegramUrl: _onsocialTelegramUrl,
  canReopen,
  reopenLoading,
  onReopen,
}: {
  accountId: string | null | undefined;
  connectedRole: GovernanceDaoRole | null;
  guardianDecisionSummary: { title: string; toneClass: string };
  canApprove: boolean;
  canReject: boolean;
  canRemove: boolean;
  canFinalize: boolean;
  finalizeLabel: string;
  currentVote: string | null;
  actionLoading: GovernanceDaoAction | null;
  onAction: (action: GovernanceDaoAction) => void;
  onAdvancedRemove: () => void;
  resolvedOutcomeLabel: string | null;
  proposalTxHref: string | null;
  onsocialTelegramUrl: string;
  canReopen?: boolean;
  reopenLoading?: boolean;
  onReopen?: () => void;
}) {
  const hasActions =
    canApprove || canReject || canRemove || canFinalize || canReopen;

  return (
    <div className="mt-3 border-t border-fade-section pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {connectedRole && (
            <span className="shrink-0 inline-flex h-5 items-center rounded-full bg-foreground/5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {connectedRole.name
                ? formatRoleLabel(connectedRole.name)
                : 'Guardian'}
            </span>
          )}
          {guardianDecisionSummary.title && (
            <p
              className={`text-xs font-medium ${guardianDecisionSummary.toneClass}`}
            >
              {guardianDecisionSummary.title}
            </p>
          )}
        </div>
        {currentVote && (
          <span
            className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium ${
              currentVote === 'Approve'
                ? 'portal-green-text'
                : currentVote === 'Reject'
                  ? 'portal-red-text'
                  : 'portal-amber-text'
            }`}
          >
            {currentVote === 'Approve' ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : currentVote === 'Reject' ? (
              <XCircle className="h-3 w-3" />
            ) : (
              <Vote className="h-3 w-3" />
            )}
            You voted {currentVote.toLowerCase()}
          </span>
        )}
      </div>

      {connectedRole && hasActions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canApprove && (
            <Button
              size="sm"
              className="flex-1 justify-center gap-1.5"
              onClick={() => onAction('VoteApprove')}
              disabled={actionLoading !== null}
              loading={actionLoading === 'VoteApprove'}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
          )}
          {canReject && (
            <Button
              size="sm"
              variant="destructive"
              className="flex-1 justify-center gap-1.5"
              onClick={() => onAction('VoteReject')}
              disabled={actionLoading !== null}
              loading={actionLoading === 'VoteReject'}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          )}
          {canFinalize && (
            <Button
              size="sm"
              variant="accent"
              className="flex-1 justify-center"
              onClick={() => onAction('Finalize')}
              disabled={actionLoading !== null}
              loading={actionLoading === 'Finalize'}
            >
              {finalizeLabel}
            </Button>
          )}
          {canRemove && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 justify-center border-amber-500/35 text-foreground hover:border-amber-500/50 hover:bg-amber-500/5"
              onClick={onAdvancedRemove}
              disabled={actionLoading !== null}
              loading={actionLoading === 'VoteRemove'}
            >
              Remove
            </Button>
          )}
          {canReopen && onReopen && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 justify-center gap-1.5"
              onClick={onReopen}
              disabled={reopenLoading}
              loading={reopenLoading}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Allow reapply
            </Button>
          )}
        </div>
      )}

      {canFinalize && finalizeLabel === 'Retry' && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground/70">
          This one failed last time. Retrying will run the same on-chain action
          again &mdash; if the underlying issue isn&apos;t fixed, it&apos;ll
          fail again.
        </p>
      )}

      {!resolvedOutcomeLabel && !currentVote && proposalTxHref && (
        <a
          href={proposalTxHref}
          target="_blank"
          rel="noreferrer"
          className="portal-action-link mt-2 inline-flex items-center gap-1 text-xs font-medium"
        >
          Submission tx
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/* ─── Share proposal ─── */

export function ShareProposal({
  appId,
  label,
}: {
  appId: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  const getUrl = useCallback(
    () => `${window.location.origin}/governance/${encodeURIComponent(appId)}`,
    [appId]
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getUrl]);

  const shareText = `🗳️ "${label}" is live on OnSocial governance — follow the vote and share your take`;

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title: `OnSocial Proposal: ${label}`,
        text: shareText,
        url: getUrl(),
      });
    } catch {
      /* user cancelled */
    }
  }, [label, shareText, getUrl]);

  const xText = `🗳️ "${label}" is live on @OnSocial governance — follow the vote and share your take`;
  const tgText = `🗳️ New OnSocial proposal: "${label}" — follow the vote and share your take`;
  const emailSubject = `OnSocial Proposal: ${label}`;
  const emailBody = `Hey, check out this governance proposal on OnSocial:\n\n"${label}"\n\n${getUrl()}`;

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-fade-detail pt-3">
      <span className="mr-0.5 text-xs text-muted-foreground">Share</span>

      {canNativeShare ? (
        /* ── Mobile / native share sheet ── */
        <>
          <button
            type="button"
            onClick={handleNativeShare}
            className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
            title="Share proposal"
          >
            <Share2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
            title="Copy link"
          >
            <Link2 className={`h-4 w-4 ${copied ? 'text-green-400' : ''}`} />
          </button>
        </>
      ) : (
        /* ── Desktop fallback: individual icons ── */
        <>
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(getUrl())}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
            title="Share on X"
          >
            <FaXTwitter className="h-4 w-4" />
          </a>

          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(getUrl())}&text=${encodeURIComponent(tgText)}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition-all hover:text-[#26A5E4] hover:brightness-125 hover:scale-110"
            title="Share on Telegram"
          >
            <RiTelegram2Line className="h-4 w-4" />
          </a>

          <a
            href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
            title="Share via email"
          >
            <Mail className="h-4 w-4" />
          </a>

          <button
            type="button"
            onClick={handleCopy}
            className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
            title="Copy link"
          >
            <Link2 className={`h-4 w-4 ${copied ? 'text-green-400' : ''}`} />
          </button>
        </>
      )}

      {copied && <span className="text-xs text-green-400">Copied!</span>}
    </div>
  );
}
