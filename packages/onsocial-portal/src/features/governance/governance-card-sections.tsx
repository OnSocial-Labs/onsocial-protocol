'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Globe,
  Link2,
  Mail,
  RotateCcw,
  Share2,
  XCircle,
  Vote,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import {
  cardDividerDetail,
  cardDividerSection,
} from '@/components/ui/card-divider';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  buildHandleUrl,
  getCounterToneClass,
  getVoteToneClass,
} from '@/features/governance/governance-card-helpers';
import {
  portalCollapseMotion,
  portalCollapseTransition,
  portalVoteProgressTransition,
} from '@/features/governance/governance-motion';
import { cn } from '@/lib/utils';
import type {
  GovernanceDaoAction,
  GovernanceDaoProposal,
  GovernanceDaoRole,
} from '@/features/governance/types';
import { GovernanceAccountChip } from '@/features/governance/governance-account-chip';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
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

export function GovernanceCardSkeleton({ className }: { className?: string }) {
  return (
    <SurfacePanel
      radius="xl"
      tone="solid"
      borderTone="strong"
      padding="roomy"
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden border-l-[3px] border-t-[3px] border-l-border/35 border-t-border/35',
        className
      )}
    >
      <div className="-mx-5 -mt-5 mb-3 flex items-center justify-between gap-3 px-5 py-2.5 md:-mx-6 md:-mt-6 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Skeleton className="h-3.5 w-8 rounded-full bg-foreground/[0.08]" />
          <Skeleton className="h-3.5 w-12 rounded-full bg-foreground/[0.06]" />
          <Skeleton className="h-3.5 w-14 rounded-full bg-foreground/[0.06]" />
        </div>
        <Skeleton className="h-3.5 w-20 rounded-full bg-foreground/[0.08]" />
      </div>

      <div className="flex items-start justify-between gap-3 pb-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-foreground/[0.08]" />
          <Skeleton className="h-4 w-[42%] max-w-48 rounded-full bg-foreground/[0.09]" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Skeleton className="h-2.5 w-10 rounded-full bg-foreground/[0.05]" />
          <Skeleton className="h-4 w-24 rounded-full bg-foreground/[0.08]" />
        </div>
      </div>

      <SkeletonText
        lines={2}
        className="mt-3"
        widths={['w-full', 'w-4/5']}
        lineClassName="h-3 rounded-full bg-foreground/[0.06]"
      />

      <div className={cn('mt-3 border-t pt-3', cardDividerSection)}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Skeleton className="h-3.5 w-8 rounded-full bg-foreground/[0.07]" />
          <Skeleton className="h-3.5 w-8 rounded-full bg-foreground/[0.06]" />
          <Skeleton className="h-3.5 w-8 rounded-full bg-foreground/[0.06]" />
          <Skeleton className="h-3.5 w-12 rounded-full bg-foreground/[0.08]" />
        </div>
      </div>
    </SurfacePanel>
  );
}

export function GovernanceCardVoteSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Skeleton className="h-3.5 w-8 rounded-full bg-foreground/[0.07]" />
        <Skeleton className="h-3.5 w-8 rounded-full bg-foreground/[0.06]" />
        <Skeleton className="h-3.5 w-8 rounded-full bg-foreground/[0.06]" />
        <Skeleton className="h-3.5 w-12 rounded-full bg-foreground/[0.08]" />
      </div>
      <Skeleton className="h-2 w-full rounded-full bg-foreground/[0.05]" />
    </div>
  );
}

export function GovernanceLiveSummary({
  liveProposal: _liveProposal,
  liveProposalId: _liveProposalId,
  liveStatusStyle: _liveStatusStyle,
  statusSummary: _statusSummary,
  currentVote: _currentVote,
  resolvedOutcomeLabel: _resolvedOutcomeLabel,
  functionCallSummary: _functionCallSummary,
  submissionTime: _submissionTime,
  statusSubtitle: _statusSubtitle,
  votingProgress,
  activeVotingRole: _activeVotingRole,
  rejectVotes,
  removeVotes,
  approveVotes,
  confirmedAction = null,
  showVoteRule = true,
}: {
  liveProposal: GovernanceDaoProposal;
  liveProposalId: number | null;
  liveStatusStyle: LiveStatusStyle;
  statusSummary: string | null;
  currentVote: string | null;
  resolvedOutcomeLabel: string | null;
  functionCallSummary: FunctionCallSummary | null;
  submissionTime: { relative: string; absolute: string } | null;
  statusSubtitle: {
    relative: string;
    absolute: string;
    tone: 'muted' | 'urgent';
  } | null;
  votingProgress: VotingProgress;
  activeVotingRole: GovernanceDaoRole | null;
  rejectVotes: string;
  removeVotes: string;
  approveVotes: string;
  confirmedAction?:
    | 'VoteApprove'
    | 'VoteReject'
    | 'VoteRemove'
    | 'Finalize'
    | null;
  showVoteRule?: boolean;
}) {
  const totalWeight = votingProgress.totalWeight ?? 0;
  const votesCast =
    votingProgress.approvals + votingProgress.rejects + votingProgress.removes;
  const barDenominator =
    showVoteRule && totalWeight > 0
      ? totalWeight
      : votesCast > 0
        ? votesCast
        : 0;
  const pulseApprove = confirmedAction === 'VoteApprove';
  const pulseReject = confirmedAction === 'VoteReject';
  const pulseRemove = confirmedAction === 'VoteRemove';
  const approvePercent =
    barDenominator > 0 ? (votingProgress.approvals / barDenominator) * 100 : 0;
  const rejectPercent =
    barDenominator > 0 ? (votingProgress.rejects / barDenominator) * 100 : 0;
  const removePercent =
    barDenominator > 0 ? (votingProgress.removes / barDenominator) * 100 : 0;
  const pendingPercent =
    showVoteRule && barDenominator > 0
      ? Math.max(100 - approvePercent - rejectPercent - removePercent, 0)
      : 0;
  const voterPoolSize = votingProgress.totalWeight ?? 0;
  const voteThreshold = votingProgress.threshold ?? 0;
  const voteRuleLabel =
    voterPoolSize > 0 && voteThreshold > 0
      ? `${voteThreshold}/${voterPoolSize} required`
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <motion.span
            animate={
              pulseApprove
                ? { scale: 1.08, filter: 'brightness(1.15)' }
                : { scale: 1, filter: 'brightness(1)' }
            }
            transition={portalCollapseTransition}
            className={`inline-flex items-center gap-1 ${getCounterToneClass('approve', approveVotes)}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{approveVotes}</span>
          </motion.span>
          <motion.span
            animate={
              pulseReject
                ? { scale: 1.08, filter: 'brightness(1.15)' }
                : { scale: 1, filter: 'brightness(1)' }
            }
            transition={portalCollapseTransition}
            className={`inline-flex items-center gap-1 ${getCounterToneClass('reject', rejectVotes)}`}
          >
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{rejectVotes}</span>
          </motion.span>
          <motion.span
            animate={
              pulseRemove
                ? { scale: 1.08, filter: 'brightness(1.15)' }
                : { scale: 1, filter: 'brightness(1)' }
            }
            transition={portalCollapseTransition}
            className={`inline-flex items-center gap-1 ${getCounterToneClass('remove', removeVotes)}`}
          >
            <Vote className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{removeVotes}</span>
          </motion.span>
        </div>
        {showVoteRule && votingProgress.threshold !== null && voteRuleLabel ? (
          <>
            <span className="text-border/40">·</span>
            <span className="font-medium text-muted-foreground">
              {voteRuleLabel}
            </span>
          </>
        ) : null}
      </div>

      {barDenominator > 0 &&
        (() => {
          const thresholdPct =
            showVoteRule && votingProgress.threshold !== null && totalWeight > 0
              ? (votingProgress.threshold / totalWeight) * 100
              : 0;
          const showMarker = thresholdPct > 0 && thresholdPct < 100;

          return (
            <div className="relative mt-2">
              <div className="flex h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <motion.div
                  className="h-full shrink-0"
                  initial={false}
                  animate={{ width: `${approvePercent}%` }}
                  transition={portalVoteProgressTransition}
                  style={{ backgroundColor: 'var(--portal-green)' }}
                />
                <motion.div
                  className="h-full shrink-0"
                  initial={false}
                  animate={{ width: `${rejectPercent}%` }}
                  transition={portalVoteProgressTransition}
                  style={{ backgroundColor: 'var(--portal-red)' }}
                />
                <motion.div
                  className="h-full shrink-0"
                  initial={false}
                  animate={{ width: `${removePercent}%` }}
                  transition={portalVoteProgressTransition}
                  style={{ backgroundColor: 'var(--portal-amber)' }}
                />
                <motion.div
                  className="h-full shrink-0 bg-black/10 dark:bg-white/10"
                  initial={false}
                  animate={{ width: `${pendingPercent}%` }}
                  transition={portalVoteProgressTransition}
                />
              </div>
              {showVoteRule && showMarker ? (
                <PortalHoverTooltip
                  tooltip={`${votingProgress.threshold}/${totalWeight} votes required`}
                  className="absolute top-0 h-2 w-px"
                  style={{ left: `${thresholdPct}%` }}
                >
                  <span
                    aria-hidden="true"
                    className="block h-2 w-px bg-foreground/30"
                  />
                </PortalHoverTooltip>
              ) : null}
            </div>
          );
        })()}
    </div>
  );
}

const GOVERNANCE_COLLAPSIBLE_TOGGLE_CLASS =
  'group flex w-full min-h-8 items-center justify-between gap-3 rounded-[0.75rem] px-3 py-1.5 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60';

const GOVERNANCE_COLLAPSIBLE_CHEVRON_CLASS =
  'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground/80';

const VOTE_ACTIVITY_COLLAPSE_AT = 6;

export function GovernanceCollapsiblePanel({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={GOVERNANCE_COLLAPSIBLE_TOGGLE_CLASS}
      >
        <p className="portal-eyebrow-wide text-muted-foreground transition-colors group-hover:text-foreground/80">
          {label}
        </p>
        <ChevronDown
          className={`${GOVERNANCE_COLLAPSIBLE_CHEVRON_CLASS} ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key={`${label}-details`}
            {...portalCollapseMotion}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function GovernanceVoteActivity({
  voteEntries,
  accountId,
  latestActionLink,
  activeVotingRole,
  eligibleVoterAccounts = null,
  className,
  defaultExpanded = false,
}: {
  voteEntries: Array<[string, string]>;
  accountId: string | null | undefined;
  latestActionLink: { label: string; href: string } | null;
  activeVotingRole: GovernanceDaoRole | null;
  eligibleVoterAccounts?: string[] | null;
  className?: string;
  defaultExpanded?: boolean;
}) {
  const [votesOpen, setVotesOpen] = useState(defaultExpanded);
  const voterPool =
    eligibleVoterAccounts ??
    (activeVotingRole?.kind?.Group ?? []).map((member) => member.toLowerCase());
  const voterSet = new Set(
    voteEntries.map(([account]) => account.toLowerCase())
  );
  const abstainers = voterPool
    .filter((member) => !voterSet.has(member))
    .sort((left, right) => left.localeCompare(right));

  if (voteEntries.length === 0 && abstainers.length === 0) return null;

  const totalGuardians = voteEntries.length + abstainers.length;
  const shouldCollapse = totalGuardians >= VOTE_ACTIVITY_COLLAPSE_AT;
  const voteSummaryLabel =
    abstainers.length === 0
      ? `${voteEntries.length} voted`
      : `${voteEntries.length}/${totalGuardians} voted`;

  const VOTE_ICONS: Record<string, typeof CheckCircle2> = {
    Approve: CheckCircle2,
    Reject: XCircle,
    Remove: Vote,
  };

  const voteList = (
    <>
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
            <GovernanceAccountChip
              accountId={voterAccount}
              avatarClassName="h-5 w-5"
              compact
            />
          </div>
        );
      })}
      {abstainers.map((account) => (
        <div
          key={account}
          className="inline-flex min-w-0 items-center gap-1.5 text-xs"
        >
          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <GovernanceAccountChip
            accountId={account}
            avatarClassName="h-5 w-5"
            compact
            className="opacity-60"
          />
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
    </>
  );

  if (!shouldCollapse) {
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>{voteList}</div>
    );
  }

  return (
    <GovernanceCollapsiblePanel
      label={`Guardian votes · ${voteSummaryLabel}`}
      isOpen={votesOpen}
      onToggle={() => setVotesOpen((open) => !open)}
    >
      <div className="mt-1 max-h-56 overflow-y-auto overscroll-contain pr-0.5">
        <div className={cn('flex flex-col gap-1.5', className)}>{voteList}</div>
      </div>
    </GovernanceCollapsiblePanel>
  );
}

export function PartnerProposalSocialLinks({
  websiteUrl,
  telegramHandle,
  xHandle,
  className,
}: {
  websiteUrl?: string | null;
  telegramHandle?: string | null;
  xHandle?: string | null;
  className?: string;
}) {
  if (!websiteUrl && !telegramHandle && !xHandle) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {websiteUrl ? (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-all hover:scale-110 hover:text-[var(--portal-green)] hover:brightness-125"
          aria-label="Website"
          onClick={(event) => event.stopPropagation()}
        >
          <PortalHoverTooltip tooltip="Website">
            <Globe className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </PortalHoverTooltip>
        </a>
      ) : null}
      {telegramHandle ? (
        <a
          href={buildHandleUrl(telegramHandle, 'telegram')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-all hover:scale-110 hover:text-[#26A5E4] hover:brightness-125"
          aria-label="Telegram"
          onClick={(event) => event.stopPropagation()}
        >
          <PortalHoverTooltip tooltip="Telegram">
            <RiTelegram2Line className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </PortalHoverTooltip>
        </a>
      ) : null}
      {xHandle ? (
        <a
          href={buildHandleUrl(xHandle, 'x')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-all hover:scale-110 hover:text-foreground hover:brightness-125"
          aria-label="X"
          onClick={(event) => event.stopPropagation()}
        >
          <PortalHoverTooltip tooltip="X">
            <FaXTwitter className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </PortalHoverTooltip>
        </a>
      ) : null}
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
    <GovernanceCollapsiblePanel
      label="Terms"
      isOpen={detailsOpen}
      onToggle={() => setDetailsOpen((open) => !open)}
    >
      <dl className="mt-2 space-y-1 text-xs">
        {rewardPerActionValue && (
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Per Action</dt>
            <dd className="ml-auto font-mono font-medium text-portal-neutral">
              {rewardPerActionValue}
            </dd>
          </div>
        )}
        {dailyCapValue && (
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Daily Cap</dt>
            <dd className="ml-auto font-mono font-medium text-portal-neutral">
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
            <dd className="ml-auto font-mono font-medium text-portal-neutral">
              {attachedDepositValue}
            </dd>
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <dt className="shrink-0 text-muted-foreground">Contract</dt>
          <dd className="ml-auto break-all font-mono font-medium text-portal-neutral">
            {functionCallSummary.receiverId}
          </dd>
        </div>
        {authorizedCallers.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="shrink-0 text-muted-foreground">Callers</dt>
            <dd className="ml-auto break-all font-mono text-portal-neutral">
              {authorizedCallers.join(', ')}
            </dd>
          </div>
        )}
      </dl>
    </GovernanceCollapsiblePanel>
  );
}

export function GovernanceGuardianActions({
  accountId: _accountId,
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
  const showActionButtons = Boolean(connectedRole && hasActions);
  const showRetryNote = canFinalize && finalizeLabel === 'Retry';
  const showSubmissionTx =
    !resolvedOutcomeLabel && !currentVote && Boolean(proposalTxHref);
  const showOutcomeOnlySummary =
    Boolean(resolvedOutcomeLabel) &&
    !connectedRole &&
    !showActionButtons &&
    !currentVote &&
    !showRetryNote &&
    !showSubmissionTx;

  if (showOutcomeOnlySummary) {
    return null;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {connectedRole && (
            <span className="shrink-0 inline-flex h-5 items-center rounded-full bg-foreground/5 px-2 portal-type-caption font-semibold uppercase tracking-widest text-muted-foreground">
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

      {showActionButtons && (
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
        <p className="mt-2 portal-type-label leading-snug text-muted-foreground/70">
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
  proposalId = null,
}: {
  appId: string;
  label: string;
  proposalId?: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare] = useState(
    () => typeof navigator !== 'undefined' && !!navigator.share
  );

  const getUrl = useCallback(
    () =>
      `${window.location.origin}${buildGovernanceProposalPath(appId, proposalId)}`,
    [appId, proposalId]
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
    <div
      className={cn(
        'mt-2 flex items-center justify-end gap-2.5 border-t pt-2.5',
        cardDividerDetail
      )}
    >
      {canNativeShare ? (
        /* ── Mobile / native share sheet ── */
        <>
          <PortalHoverTooltip tooltip="Share proposal">
            <button
              type="button"
              onClick={handleNativeShare}
              className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
              aria-label="Share proposal"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </PortalHoverTooltip>

          <PortalHoverTooltip tooltip="Copy link">
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
              aria-label="Copy link"
            >
              <Link2 className={`h-4 w-4 ${copied ? 'text-green-400' : ''}`} />
            </button>
          </PortalHoverTooltip>
        </>
      ) : (
        /* ── Desktop fallback: individual icons ── */
        <>
          <PortalHoverTooltip tooltip="Share on X">
            <a
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(getUrl())}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
              aria-label="Share on X"
            >
              <FaXTwitter className="h-4 w-4" />
            </a>
          </PortalHoverTooltip>

          <PortalHoverTooltip tooltip="Share on Telegram">
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(getUrl())}&text=${encodeURIComponent(tgText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-muted-foreground transition-all hover:text-[#26A5E4] hover:brightness-125 hover:scale-110"
              aria-label="Share on Telegram"
            >
              <RiTelegram2Line className="h-4 w-4" />
            </a>
          </PortalHoverTooltip>

          <PortalHoverTooltip tooltip="Share via email">
            <a
              href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
              aria-label="Share via email"
            >
              <Mail className="h-4 w-4" />
            </a>
          </PortalHoverTooltip>

          <PortalHoverTooltip tooltip="Copy link">
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground transition-all hover:text-foreground hover:brightness-125 hover:scale-110"
              aria-label="Copy link"
            >
              <Link2 className={`h-4 w-4 ${copied ? 'text-green-400' : ''}`} />
            </button>
          </PortalHoverTooltip>
        </>
      )}

      {copied && <span className="text-xs text-green-400">Copied!</span>}
    </div>
  );
}
