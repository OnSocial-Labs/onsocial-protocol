'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Code2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  MessageSquare,
  RefreshCw,
  Terminal,
  XCircle,
} from 'lucide-react';
import { RiTelegram2Line } from 'react-icons/ri';
import { useWallet } from '@/contexts/wallet-context';
import { Button, buttonArrowLeftClass } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { StatStripSkeleton } from '@/components/ui/skeleton';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { PortalBadge } from '@/components/ui/portal-badge';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
  type OnChainAppConfig,
} from '@/lib/near-rpc';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import { portalFrameStyle } from '@/lib/portal-colors';
import { fetchRewardsAppConfig } from '@/features/governance/api';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import {
  buildGovernanceDelegationPlan,
  rotateKey,
} from '@/features/partners/api';
import {
  botSnippet,
  envSnippet,
  installSnippet,
  packageJsonSnippet,
  sdkOnlySnippet,
} from '@/features/partners/snippets';
import type {
  AppRegistration,
  GovernanceProposal,
} from '@/features/partners/types';
import {
  CodeBlock,
  CopyButton,
  DownloadButton,
} from '@/features/partners/ui-helpers';
import { cn } from '@/lib/utils';

function formatSocialAmount(value: string, maximumFractionDigits = 2): string {
  const numeric = Number(yoctoToSocial(value));
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(numeric);
}

function formatNearAmount(value: string, maximumFractionDigits = 4): string {
  const numeric = Number(yoctoToNear(value));
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(numeric);
}

function formatCooldownRelative(remainingNs: string) {
  const ns = BigInt(remainingNs || '0');

  if (ns <= 0n) {
    return 'Ready now';
  }

  const remainingMs = Number(ns / 1_000_000n);

  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 'Ready now';
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const totalHours = Math.ceil(remainingMs / 3_600_000);
  const totalDays = Math.ceil(remainingMs / 86_400_000);

  if (totalMinutes < 60) {
    return `Unlocks in ${totalMinutes}m`;
  }

  if (totalHours < 24) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0
      ? `Unlocks in ${hours}h ${minutes}m`
      : `Unlocks in ${hours}h`;
  }

  if (totalDays < 7) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours > 0 ? `Unlocks in ${days}d ${hours}h` : `Unlocks in ${days}d`;
  }

  return `Unlocks in ${totalDays} days`;
}

function PreviewPill({
  children,
  accent = 'neutral',
}: {
  children: React.ReactNode;
  accent?: 'neutral' | 'blue' | 'purple';
}) {
  const accentClass =
    accent === 'blue'
      ? 'border-[color:var(--portal-blue-frame-border)] bg-[color:var(--portal-blue-frame-bg)] text-gray-100'
      : accent === 'purple'
        ? 'border-[color:var(--portal-purple-frame-border)] bg-[color:var(--portal-purple-frame-bg)] text-gray-100'
        : 'border-[color:var(--portal-neutral-frame-border)] bg-[color:var(--portal-neutral-frame-bg)] text-[var(--portal-neutral)]';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${accentClass}`}
    >
      {children}
    </span>
  );
}

function SetupStepHeader({
  step,
  title,
  action,
}: {
  step: number;
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border/50 text-xs">
          {step}
        </span>
        {title}
      </div>
      {action}
    </div>
  );
}

export function PendingState({
  appId,
  label,
  phase = 'review',
  proposal,
  acting = false,
  actionError = '',
  onSubmitProposal,
}: {
  appId: string;
  label: string;
  phase?: 'review' | 'ready' | 'governance' | 'eligibility';
  proposal?: GovernanceProposal | null;
  acting?: boolean;
  actionError?: string;
  onSubmitProposal?: () => void | Promise<void>;
}) {
  const isReady = phase === 'ready';
  const isGovernance = phase === 'governance';
  const isEligibility = phase === 'eligibility';
  const [proposalDetailsOpen, setProposalDetailsOpen] = useState(false);
  const explorerHref = proposal?.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${proposal.tx_hash}`
    : null;
  const governanceHref = isGovernance
    ? buildGovernanceProposalPath(appId, proposal?.proposal_id ?? null)
    : null;

  return (
    <div className="px-1 py-2 text-center md:px-2 md:py-3">
      <p className="mb-3 portal-eyebrow text-muted-foreground">
        {isEligibility
          ? 'Eligibility'
          : isReady
            ? 'Proposal Ready'
            : isGovernance
              ? 'In Governance'
              : 'Under Review'}
      </p>
      <Clock className="portal-blue-icon mx-auto mb-4 h-10 w-10" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        {isEligibility
          ? 'Proposal access'
          : isReady
            ? 'Proposal ready'
            : isGovernance
              ? 'Waiting for DAO approval'
              : 'Launch received'}
      </h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        <span className="font-semibold text-foreground">{label}</span> (
        <span className="portal-blue-text font-mono">{appId}</span>) is
        {isEligibility
          ? ' ready for a quick governance eligibility check.'
          : isReady
            ? ' ready for the final DAO proposal from the connected wallet.'
            : isGovernance
              ? ' now waiting for DAO approval and execution.'
              : ' now in review.'}
      </p>

      {isEligibility && (
        <p className="text-sm text-muted-foreground">
          A quick check confirms whether this wallet has enough delegated
          governance weight for the final DAO proposal.
        </p>
      )}

      {isReady && onSubmitProposal && (
        <div className="space-y-3">
          <Button
            onClick={onSubmitProposal}
            disabled={acting}
            size="default"
            loading={acting}
          >
            Open DAO Proposal
          </Button>
          <p className="text-sm text-muted-foreground">
            The final proposal opens in the wallet and is sent to the governance
            DAO.
          </p>
        </div>
      )}

      {isGovernance && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            After execution, reveal the API key with a wallet confirmation.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {governanceHref && (
              <Link
                href={governanceHref}
                className="portal-action-link inline-flex items-center gap-1.5 text-sm"
              >
                View DAO proposal
              </Link>
            )}
            {explorerHref && (
              <a
                href={explorerHref}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-action-link inline-flex items-center gap-1.5 text-sm"
              >
                View on explorer
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {proposal?.description && (
            <div className="mx-auto max-w-xl border-t border-fade-section pt-3 text-left">
              <button
                type="button"
                onClick={() => setProposalDetailsOpen((open) => !open)}
                aria-expanded={proposalDetailsOpen}
                className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-foreground"
              >
                <span>Proposal details</span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${proposalDetailsOpen ? 'rotate-180' : ''}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {proposalDetailsOpen ? (
                  <motion.div
                    key="proposal-details"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {proposal.description}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {!isGovernance && proposal?.description && (
        <p className="mx-auto mb-4 max-w-xl text-sm text-muted-foreground">
          Proposal:{' '}
          <span className="text-foreground">{proposal.description}</span>
        </p>
      )}

      {!isReady && !isGovernance && (
        <p className="text-sm text-muted-foreground">
          The next step appears here as soon as the draft is ready.
        </p>
      )}

      {actionError && (
        <p className="portal-red-text mx-auto mt-4 max-w-xl text-sm">
          {actionError}
        </p>
      )}
    </div>
  );
}

export function GovernanceEligibilityState({
  appId: _appId,
  label: _label,
  eligibility,
  proposalBondDisplay = '1',
  proposalBond = '0',
  acting = false,
  refreshPending = false,
  actionKind,
  actionError = '',
  onRefresh,
  onPrepare,
  onSubmitProposal,
  onCancel,
  onWithdrawExcess,
}: {
  appId: string;
  label: string;
  eligibility: GovernanceEligibilitySnapshot | null;
  proposalBondDisplay?: string;
  proposalBond?: string;
  acting?: boolean;
  refreshPending?: boolean;
  actionKind?: 'prepare' | 'submit' | 'cancel' | 'withdraw';
  actionError?: string;
  onRefresh?: () => void | Promise<void>;
  onPrepare?: () => void | Promise<void>;
  onSubmitProposal?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  onWithdrawExcess?: () => void | Promise<void>;
}) {
  const requiredWeight = formatSocialAmount(eligibility?.requiredWeight ?? '0');
  const delegatedWeight = formatSocialAmount(
    eligibility?.delegatedWeight ?? '0'
  );
  const walletBalance = formatSocialAmount(eligibility?.walletBalance ?? '0');
  const depositNeeded = formatSocialAmount(eligibility?.depositNeeded ?? '0');
  const delegateNeeded = formatSocialAmount(eligibility?.delegateNeeded ?? '0');
  const withdrawableAmount = formatSocialAmount(
    eligibility?.availableToWithdraw ?? '0'
  );
  const nearBalance = formatNearAmount(eligibility?.nearBalance ?? '0');
  const registrationStorageReserve = formatNearAmount(
    eligibility?.registrationStorageDeposit ?? '0'
  );
  const canCoverDeposit = eligibility
    ? BigInt(eligibility.walletBalance) >= BigInt(eligibility.depositNeeded)
    : false;
  const canCoverProposalBond = eligibility
    ? BigInt(eligibility.nearBalance) >= BigInt(proposalBond)
    : false;
  const needsAdditionalStorage = eligibility
    ? BigInt(eligibility.nearStorageNeeded) > 0n
    : false;
  const preparationPlan = eligibility
    ? buildGovernanceDelegationPlan(
        eligibility,
        BigInt(eligibility.remainingToThreshold)
      )
    : null;
  const delegationBlockedByCooldown = Boolean(
    eligibility?.isInCooldown &&
      preparationPlan &&
      BigInt(preparationPlan.delegateAmount) > 0n
  );
  const depositOnlyDuringCooldown = Boolean(
    preparationPlan?.depositOnlyDuringCooldown
  );
  const cooldownStatusLine = eligibility?.isInCooldown
    ? formatCooldownRelative(eligibility.cooldownRemainingNs)
    : null;

  let nextActionBody = 'Making sure everything is set before you can go live.';
  let nextActionLabel = 'Checking…';
  let nextActionNote = '';
  let nextActionHandler = onRefresh;
  let nextActionDisabled = acting || !onRefresh;
  let nextActionKind: 'prepare' | 'submit' | null = null;

  if (eligibility) {
    if (eligibility.canPropose) {
      if (canCoverProposalBond) {
        nextActionBody =
          'Everything checks out \u2014 go ahead and open your proposal.';
        nextActionLabel = 'Open proposal';
        nextActionNote = '';
        nextActionHandler = onSubmitProposal;
        nextActionDisabled = acting || !onSubmitProposal;
        nextActionKind = 'submit';
      } else {
        nextActionBody = `Add ${proposalBondDisplay} NEAR to your wallet for the proposal bond.`;
        nextActionLabel = `Need ${proposalBondDisplay} NEAR bond`;
        nextActionNote = '';
        nextActionHandler = undefined;
        nextActionDisabled = true;
        nextActionKind = null;
      }
    } else if (eligibility.isRegistered && needsAdditionalStorage) {
      nextActionBody =
        'Add NEAR for storage, or undelegate an existing entry to free a slot.';
      nextActionLabel = 'Refresh';
      nextActionNote = '';
      nextActionHandler = onRefresh;
      nextActionDisabled = acting || !onRefresh;
    } else if (!eligibility.isRegistered || eligibility.depositNeeded !== '0') {
      nextActionBody = canCoverDeposit
        ? eligibility.isInCooldown
          ? eligibility.isRegistered
            ? 'Stakes SOCIAL now.'
            : `Registers staking, reserves ${registrationStorageReserve} NEAR, and stakes SOCIAL.`
          : eligibility.isRegistered
            ? 'Stakes and delegates the required SOCIAL.'
            : `Registers staking, reserves ${registrationStorageReserve} NEAR, and delegates the required SOCIAL.`
        : `Add ${depositNeeded} more SOCIAL to your wallet first.`;
      nextActionLabel = canCoverDeposit
        ? 'Prepare governance'
        : `Add ${depositNeeded} SOCIAL`;
      nextActionNote = '';
      nextActionHandler = onPrepare;
      nextActionDisabled =
        acting ||
        !canCoverDeposit ||
        !onPrepare ||
        (delegationBlockedByCooldown && !depositOnlyDuringCooldown);
      nextActionKind = canCoverDeposit ? 'prepare' : null;
    } else if (eligibility.delegateNeeded !== '0') {
      if (eligibility.isInCooldown) {
        nextActionBody =
          'Delegation is paused until cooldown ends. Refresh after it unlocks.';
        nextActionLabel = `Delegate ${delegateNeeded} SOCIAL`;
        nextActionNote = '';
        nextActionHandler = onPrepare;
        nextActionDisabled = true;
        nextActionKind = 'prepare';
      } else {
        nextActionBody = `Delegate ${delegateNeeded} more SOCIAL to reach the threshold.`;
        nextActionLabel = `Delegate ${delegateNeeded} SOCIAL`;
        nextActionNote = '';
        nextActionHandler = onPrepare;
        nextActionDisabled = acting || !onPrepare;
        nextActionKind = 'prepare';
      }
    } else {
      nextActionBody = 'Looks good — refresh to confirm your latest balance.';
      nextActionLabel = 'Refresh';
      nextActionNote = '';
      nextActionHandler = onRefresh;
      nextActionDisabled = acting || !onRefresh;
    }
  }

  const bondValue = canCoverProposalBond
    ? `${proposalBondDisplay} NEAR`
    : `${nearBalance} / ${proposalBondDisplay} NEAR`;

  const actionHelper = (() => {
    if (!eligibility) {
      return { text: nextActionBody, tone: 'muted' as const };
    }

    if (delegationBlockedByCooldown) {
      return {
        text: `${nextActionBody} ${cooldownStatusLine ?? 'Delegation paused until cooldown ends.'}`,
        tone: 'amber' as const,
      };
    }

    if (depositOnlyDuringCooldown && nextActionKind === 'prepare') {
      return {
        text: `${nextActionBody} ${cooldownStatusLine ?? 'Cooldown active'}, then delegation completes.`,
        tone: 'muted' as const,
      };
    }

    return { text: nextActionBody, tone: 'muted' as const };
  })();

  return (
    <div className="mx-auto w-full min-w-0 max-w-xl">
      {!eligibility ? (
        <StatStripSkeleton columns={4} items={4} showTopDivider={false} />
      ) : (
        <StatStrip columns={4} showTopDivider={false}>
          <StatStripCell
            label="Delegated"
            value={`${delegatedWeight} SOCIAL`}
            valueClassName={
              eligibility.canPropose ? 'portal-green-text' : 'portal-blue-text'
            }
            showDivider
            size="sm"
          />
          <StatStripCell
            label="Threshold"
            value={`${requiredWeight} SOCIAL`}
            showDivider
            size="sm"
          />
          {!eligibility.canPropose ? (
            <StatStripCell
              label="Wallet"
              value={walletBalance}
              showDivider
              size="sm"
            />
          ) : null}
          <StatStripCell
            label="Bond"
            value={bondValue}
            valueClassName={
              canCoverProposalBond ? 'portal-green-text' : 'portal-amber-text'
            }
            size="sm"
          />
        </StatStrip>
      )}

      {!eligibility && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <PulsingDots size="sm" /> Checking things out…
        </div>
      )}

      {eligibility ? (
        <div className="mt-3 space-y-3">
          <p className="portal-eyebrow text-muted-foreground">
            What&apos;s next
          </p>
          <p
            className={cn(
              'text-sm',
              actionHelper.tone === 'amber'
                ? 'text-amber-600'
                : 'text-muted-foreground'
            )}
          >
            {actionHelper.text}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              onClick={nextActionHandler}
              disabled={nextActionDisabled}
              className="order-1 h-11 w-full gap-1.5 font-semibold disabled:opacity-50 sm:order-2 sm:w-auto"
              loading={acting && actionKind === nextActionKind}
            >
              {nextActionLabel}
            </Button>
            {onCancel ? (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={acting}
                className="order-2 h-11 w-full gap-1.5 font-semibold disabled:opacity-50 sm:order-1 sm:w-auto"
                loading={acting && actionKind === 'cancel'}
              >
                <ArrowLeft className={`h-4 w-4 ${buttonArrowLeftClass}`} />
                Back to form
              </Button>
            ) : null}
            {eligibility.canPropose &&
            eligibility.availableToWithdraw !== '0' &&
            !eligibility.isInCooldown &&
            onWithdrawExcess ? (
              <Button
                type="button"
                variant="outline"
                onClick={onWithdrawExcess}
                disabled={acting}
                className="order-3 h-11 w-full gap-1.5 font-semibold disabled:opacity-50 sm:w-auto"
                loading={acting && actionKind === 'withdraw'}
              >
                {`Withdraw ${withdrawableAmount} SOCIAL`}
              </Button>
            ) : null}
          </div>
          {nextActionNote ? (
            <p
              className={cn(
                'text-xs',
                delegationBlockedByCooldown
                  ? 'text-amber-600'
                  : 'text-muted-foreground'
              )}
            >
              {nextActionNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {eligibility ? (
        <StatStrip columns={3} groupClassName="mt-3" showBottomDivider={false}>
          <StatStripCell label="DAO" showDivider size="sm">
            <a
              href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${eligibility.daoAccountId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-action-link inline-flex items-center justify-center gap-1.5 text-sm"
            >
              View
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </StatStripCell>
          <StatStripCell label="Staking" showDivider size="sm">
            {eligibility.stakingContractId ? (
              <a
                href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${eligibility.stakingContractId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-action-link inline-flex items-center justify-center gap-1.5 text-sm"
              >
                View
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">Unavailable</span>
            )}
          </StatStripCell>
          <StatStripCell label="Position" size="sm">
            <Link
              href="/governance/manage"
              className="portal-action-link group inline-flex items-center justify-center gap-1.5 text-sm"
            >
              Manage
              <ProtocolMotionArrow className="h-3 w-3" />
            </Link>
          </StatStripCell>
        </StatStrip>
      ) : null}

      {actionError ? (
        <div className="portal-red-panel portal-red-text mt-3 rounded-[1rem] border px-4 py-3 text-sm">
          {actionError}
        </div>
      ) : null}
    </div>
  );
}

export function RejectedState({
  appId,
  label,
}: {
  appId: string;
  label: string;
}) {
  return (
    <div className="px-1 py-2 text-center md:px-2 md:py-3">
      <XCircle className="portal-red-icon w-10 h-10 mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        Not approved this time
      </h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        <span className="font-semibold text-foreground">{label}</span> (
        <span className="portal-blue-text font-mono">{appId}</span>) didn&apos;t
        make it through review this round.
      </p>
      <p className="text-sm text-muted-foreground">
        Want feedback before trying again? Reach out on{' '}
        <a
          href="https://t.me/onsocialprotocol"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex whitespace-nowrap align-middle items-center gap-1 font-medium portal-link"
        >
          <RiTelegram2Line className="h-3.5 w-3.5 shrink-0 translate-y-[0.5px]" />
          Telegram
        </a>
        .
      </p>
    </div>
  );
}

export function ApprovedDashboard({
  registration,
  revealingKey = false,
  actionError = '',
  onRevealKey,
  onKeyRotated,
}: {
  registration: AppRegistration;
  revealingKey?: boolean;
  actionError?: string;
  onRevealKey?: () => Promise<void>;
  onKeyRotated?: (_newKey: string) => void;
}) {
  const { accountId } = useWallet();
  const [tab, setTab] = useState<'bot' | 'sdk'>('bot');
  const [setupOpen, setSetupOpen] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState('');
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(true);
  const hasApiKey = Boolean(registration.apiKey);
  const maskedKey = hasApiKey
    ? `${registration.apiKey!.slice(0, 10)}${'•'.repeat(32)}${registration.apiKey!.slice(-4)}`
    : '••••••••••••••••••••••••••••••••••••';

  useEffect(() => {
    setConfigLoading(true);
    fetchRewardsAppConfig(registration.appId)
      .then((cfg) => setOnChainConfig(cfg))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, [registration.appId]);

  const handleRotate = async () => {
    if (!accountId || !registration.apiKey) return;
    setRotating(true);
    setRotateError('');
    try {
      const result = await rotateKey(accountId, registration.apiKey);
      if (result.api_key) {
        onKeyRotated?.(result.api_key);
        setKeyRevealed(true);
      }
      setShowRotateConfirm(false);
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'Rotation failed');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div>
      {/* ── Key header ── */}
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border"
          style={portalFrameStyle('green')}
        >
          <Key className="portal-green-icon w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold tracking-[-0.02em]">SOCIAL key</h3>
            <PortalHoverTooltip tooltip="Rotate API key">
              <Button
                onClick={() => setShowRotateConfirm(true)}
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={!hasApiKey}
                aria-label="Rotate API key"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rotate
              </Button>
            </PortalHoverTooltip>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            App:{' '}
            <span className="font-mono text-foreground">
              {registration.appId}
            </span>
            {' · '}
            Label: <span className="text-foreground">{registration.label}</span>
          </p>
          <div className="relative">
            <code className="portal-green-text block break-all rounded-[1rem] border border-border/50 bg-background/50 px-3 py-2.5 pr-[4.5rem] font-mono text-xs md:px-4 md:py-3 md:text-sm select-none">
              {hasApiKey && keyRevealed ? registration.apiKey : maskedKey}
            </code>
            {hasApiKey && (
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                <PortalHoverTooltip
                  tooltip={keyRevealed ? 'Hide key' : 'Reveal key'}
                >
                  <button
                    type="button"
                    onClick={() => setKeyRevealed((value) => !value)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                    aria-label={keyRevealed ? 'Hide key' : 'Reveal key'}
                  >
                    {keyRevealed ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </PortalHoverTooltip>
                <CopyButton
                  text={registration.apiKey!}
                  className="inline-flex h-7 w-7 items-center justify-center"
                />
              </div>
            )}
          </div>
          <AnimatePresence initial={false} mode="wait">
            {hasApiKey ? (
              <motion.p
                key="api-key-note"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="portal-amber-text mt-2 text-xs"
              >
                Keep this private and store it somewhere safe.
              </motion.p>
            ) : (
              <motion.div
                key="reveal-key-cta"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="mt-3 flex flex-wrap items-center gap-3"
              >
                <Button
                  onClick={() => {
                    onRevealKey?.().catch(() => {});
                  }}
                  variant="accent"
                  size="sm"
                  disabled={revealingKey || !onRevealKey}
                  loading={revealingKey}
                >
                  Reveal full key
                </Button>
                <p className="text-xs text-muted-foreground">
                  Full key access requires wallet confirmation.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {actionError ? (
              <motion.p
                key="api-key-action-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="portal-red-text mt-3 text-xs"
              >
                {actionError}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {showRotateConfirm && hasApiKey ? (
              <motion.div
                key="rotate-confirm"
                initial={{ opacity: 0, height: 0, y: -6 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
              >
                <div className="portal-amber-panel mt-4 rounded-[1rem] border p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="portal-amber-icon mt-0.5 h-5 w-5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="mb-1 text-sm font-medium">Rotate key?</p>
                      <p className="mb-3 text-xs text-muted-foreground">
                        The current key stops working immediately. Update the
                        bot&apos;s
                        <code className="portal-blue-text">
                          {' '}
                          ONSOCIAL_API_KEY
                        </code>{' '}
                        env var with the new value.
                      </p>
                      {rotateError && (
                        <p className="portal-red-text mb-3 text-xs">
                          {rotateError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={handleRotate}
                          disabled={rotating}
                          size="sm"
                          className="text-xs font-medium"
                          loading={rotating}
                        >
                          Rotate key
                        </Button>
                        <Button
                          onClick={() => {
                            setShowRotateConfirm(false);
                            setRotateError('');
                          }}
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          disabled={rotating}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Usage bars (inline) ── */}
      <div className="mt-5 border-t border-fade-detail pt-5">
        {configLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PulsingDots size="sm" /> Loading on-chain data…
          </div>
        )}
        {!configLoading && !onChainConfig && (
          <p className="portal-amber-text text-xs">
            <AlertTriangle className="portal-amber-icon w-3 h-3 inline mr-1" />
            App rules are not visible on-chain yet. Contact the OnSocial team.
          </p>
        )}
        {!configLoading && onChainConfig && (
          <OnChainConfigSummary config={onChainConfig} />
        )}
      </div>

      {/* ── Setup Guide (collapsible) ── */}
      <div className="mt-5 border-t border-fade-detail pt-4">
        <button
          type="button"
          onClick={() => setSetupOpen((open) => !open)}
          aria-expanded={setupOpen}
          className="group -mx-1 flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-foreground/[0.03]"
        >
          <span className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-foreground/80">
            Setup Guide
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-[color,transform] duration-200 group-hover:text-foreground/80',
              setupOpen && 'rotate-180'
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {setupOpen && (
            <motion.div
              key="setup-content"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                {hasApiKey ? (
                  <>
                    <div className="mb-4 flex max-w-xs gap-1 rounded-full border border-border/50 bg-muted/20 p-1">
                      <Button
                        type="button"
                        onClick={() => setTab('bot')}
                        variant={tab === 'bot' ? 'default' : 'outline'}
                        className="h-auto flex-1 rounded-full px-4 py-2 text-sm"
                      >
                        <Terminal className="w-4 h-4 inline mr-1.5" />
                        Telegram Bot
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setTab('sdk')}
                        variant={tab === 'sdk' ? 'default' : 'outline'}
                        className="h-auto flex-1 rounded-full px-4 py-2 text-sm"
                      >
                        <Code2 className="w-4 h-4 inline mr-1.5" />
                        SDK Only
                      </Button>
                    </div>

                    <AnimatePresence initial={false} mode="wait">
                      <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div className="space-y-4">
                          <SetupStepHeader step={1} title="Install" />
                          <CodeBlock
                            code={installSnippet(tab)}
                            language="bash"
                          />
                        </div>

                        <div className="mt-6 space-y-4">
                          <SetupStepHeader
                            step={2}
                            title="Add .env"
                            action={
                              <DownloadButton
                                filename=".env"
                                content={envSnippet(
                                  registration.appId,
                                  registration.apiKey!,
                                  tab
                                )}
                                label="Download .env"
                              />
                            }
                          />
                          <CodeBlock
                            code={envSnippet(
                              registration.appId,
                              registration.apiKey!,
                              tab,
                              {
                                maskApiKey: true,
                              }
                            )}
                            language="bash"
                          />
                          {tab === 'bot' && (
                            <p className="text-xs text-muted-foreground">
                              A{' '}
                              <code className="portal-blue-text">
                                BOT_TOKEN
                              </code>{' '}
                              comes from{' '}
                              <a
                                href="https://t.me/BotFather"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="portal-action-link"
                              >
                                @BotFather
                              </a>{' '}
                              on Telegram.
                            </p>
                          )}
                        </div>

                        <div className="mt-6 space-y-4">
                          <SetupStepHeader
                            step={3}
                            title={
                              tab === 'bot' ? 'Create bot.ts' : 'Use the SDK'
                            }
                          />
                          <CodeBlock
                            code={
                              tab === 'bot' ? botSnippet() : sdkOnlySnippet()
                            }
                          />
                        </div>

                        <div className="mt-6 space-y-4">
                          <SetupStepHeader step={4} title="Run" />
                          {tab === 'bot' ? (
                            <CodeBlock code="npm start" language="bash" />
                          ) : (
                            <CodeBlock
                              code="node --env-file=.env --import tsx app.ts"
                              language="bash"
                            />
                          )}
                        </div>

                        {tab === 'bot' && (
                          <div className="mt-6 border-t border-fade-detail pt-6">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h4 className="mb-1 text-sm font-medium">
                                  Download starter project
                                </h4>
                                <p className="text-xs text-muted-foreground">
                                  package.json + .env + bot.ts, ready for{' '}
                                  <code className="portal-blue-text">
                                    npm install &amp;&amp; npm start
                                  </code>
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <DownloadButton
                                  filename="package.json"
                                  content={packageJsonSnippet()}
                                  label="package.json"
                                />
                                <DownloadButton
                                  filename="bot.ts"
                                  content={botSnippet()}
                                  label="bot.ts"
                                />
                                <DownloadButton
                                  filename=".env"
                                  content={envSnippet(
                                    registration.appId,
                                    registration.apiKey!,
                                    tab
                                  )}
                                  label=".env"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ── Preview (inline within setup, bot tab only) ── */}
                        {tab === 'bot' && (
                          <div className="mt-6 border-t border-fade-detail pt-6">
                            <p className="mb-1 portal-eyebrow text-muted-foreground">
                              <MessageSquare className="portal-blue-icon mr-1.5 inline h-3.5 w-3.5" />
                              Preview
                            </p>
                            <p className="mb-4 text-xs text-muted-foreground">
                              How your bot looks in Telegram — fully branded,
                              zero custom code.
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="mb-2 portal-eyebrow text-muted-foreground">
                                  /start
                                </p>
                                <div className="rounded-[1rem] border border-white/5 bg-[#151827] p-3 text-sm font-mono leading-relaxed text-gray-200 shadow-inner shadow-black/10 space-y-1">
                                  <p>
                                    🤝 OnSocial stands with {registration.label}
                                  </p>
                                  <p className="mt-2">👋 Welcome!</p>
                                  <p className="mt-2 text-gray-400">
                                    Earn 0.1 SOCIAL per message (up to 1/day)
                                    for being active in the group.
                                  </p>
                                  <p className="mt-1 text-gray-400">
                                    Tap below to link your NEAR account and
                                    start earning 👇
                                  </p>
                                  <div className="mt-3 flex gap-2">
                                    <PreviewPill accent="blue">
                                      🔗 Link Account
                                    </PreviewPill>
                                    <PreviewPill>❓ How it works</PreviewPill>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="mb-2 portal-eyebrow text-muted-foreground">
                                  /balance
                                </p>
                                <div className="rounded-[1rem] border border-white/5 bg-[#151827] p-3 text-sm font-mono leading-relaxed text-gray-200 shadow-inner shadow-black/10 space-y-1">
                                  <p>
                                    🤝 OnSocial stands with {registration.label}
                                  </p>
                                  <p className="mt-2">
                                    ⭐ Rewards for{' '}
                                    <span className="portal-green-text">
                                      alice.near
                                    </span>
                                  </p>
                                  <p className="mt-2">
                                    💎 Unclaimed: 12.5 SOCIAL
                                  </p>
                                  <p className="portal-green-text text-xs">
                                    (ready to claim!)
                                  </p>
                                  <p className="mt-1 text-gray-400">
                                    📈 Daily progress: 0.5 / 1 SOCIAL
                                  </p>
                                  <p className="mt-1">
                                    🏆 Total earned: 42 SOCIAL
                                  </p>
                                  <div className="mt-3 flex gap-2">
                                    <PreviewPill accent="purple">
                                      💎 Claim
                                    </PreviewPill>
                                    <PreviewPill>🔄 Refresh</PreviewPill>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </>
                ) : (
                  <div className="portal-blue-panel rounded-[1rem] border px-4 py-4 text-sm">
                    Reveal the full key to unlock the setup guide, .env
                    downloads, and key rotation.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
