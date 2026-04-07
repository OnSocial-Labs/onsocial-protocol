'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  viewContract,
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
  type OnChainAppConfig,
} from '@/lib/near-rpc';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import { portalFrameStyle } from '@/lib/portal-colors';
import { rotateKey } from '@/features/partners/api';
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
        : 'border-white/10 bg-white/5 text-gray-300';

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
  const governanceHref = isGovernance ? `/governance/${encodeURIComponent(appId)}` : null;

  return (
    <div className="px-1 py-2 text-center md:px-2 md:py-3">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
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
  label,
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
  const remainingWeight = formatSocialAmount(
    eligibility?.remainingToThreshold ?? '0'
  );
  const availableToDelegate = formatSocialAmount(
    eligibility?.availableToDelegate ?? '0'
  );
  const walletBalance = formatSocialAmount(eligibility?.walletBalance ?? '0');
  const depositNeeded = formatSocialAmount(eligibility?.depositNeeded ?? '0');
  const delegateNeeded = formatSocialAmount(eligibility?.delegateNeeded ?? '0');
  const withdrawableAmount = formatSocialAmount(
    eligibility?.availableToWithdraw ?? '0'
  );
  const nearBalance = formatNearAmount(eligibility?.nearBalance ?? '0');
  const nearStorageNeeded = formatNearAmount(
    eligibility?.nearStorageNeeded ?? '0'
  );
  const registrationStorageReserve = formatNearAmount(
    eligibility?.registrationStorageDeposit ?? '0'
  );
  const canCoverDeposit = eligibility
    ? BigInt(eligibility.walletBalance) >= BigInt(eligibility.depositNeeded)
    : false;
  const canCoverStorage = eligibility
    ? BigInt(eligibility.nearBalance) >= BigInt(eligibility.nearStorageNeeded)
    : false;
  const canCoverProposalBond = eligibility
    ? BigInt(eligibility.nearBalance) >= BigInt(proposalBond)
    : false;
  const needsAdditionalStorage = eligibility
    ? BigInt(eligibility.nearStorageNeeded) > 0n
    : false;
  const proposalSetupSummary = eligibility?.canPropose
    ? `${delegatedWeight} SOCIAL delegated — you meet the ${requiredWeight} threshold.`
    : `${requiredWeight} delegated SOCIAL needed to open the proposal.`;

  let nextActionTitle = 'Checking things out';
  let nextActionBody = 'Making sure everything is set before you can go live.';
  let nextActionLabel = 'Checking…';
  let nextActionNote = '';
  let nextActionHandler = onRefresh;
  let nextActionDisabled = acting || !onRefresh;
  let nextActionKind: 'prepare' | 'submit' | null = null;

  if (eligibility) {
    if (eligibility.canPropose) {
      if (canCoverProposalBond) {
        nextActionTitle = 'All set';
        nextActionBody =
          'Everything checks out \u2014 go ahead and open your proposal.';
        nextActionLabel = 'Open proposal';
        nextActionNote = '';
        nextActionHandler = onSubmitProposal;
        nextActionDisabled = acting || !onSubmitProposal;
        nextActionKind = 'submit';
      } else {
        nextActionTitle = `Need ${proposalBondDisplay} NEAR`;
        nextActionBody = `The DAO requires a ${proposalBondDisplay} NEAR bond to open this proposal.`;
        nextActionLabel = `Need ${proposalBondDisplay} NEAR bond`;
        nextActionNote = '';
        nextActionHandler = undefined;
        nextActionDisabled = true;
        nextActionKind = null;
      }
    } else if (eligibility.isRegistered && needsAdditionalStorage) {
      nextActionTitle = 'Storage is full';
      nextActionBody =
        'No room for another delegation entry. Undelegate an existing one first.';
      nextActionLabel = 'Refresh';
      nextActionNote = '';
      nextActionHandler = onRefresh;
      nextActionDisabled = acting || !onRefresh;
      nextActionTitle = 'Add NEAR to continue';
    } else if (!eligibility.isRegistered || eligibility.depositNeeded !== '0') {
      nextActionTitle = canCoverDeposit
        ? 'Get governance ready'
        : `Need ${depositNeeded} more SOCIAL`;
      nextActionBody = canCoverDeposit
        ? eligibility.isInCooldown
          ? eligibility.isRegistered
            ? 'Stakes the required SOCIAL. Delegation unlocks after cooldown.'
            : `Sets up staking, reserves ${registrationStorageReserve} NEAR for storage, and stakes your SOCIAL. Delegation unlocks after cooldown.`
          : eligibility.isRegistered
            ? 'Stakes and delegates the required SOCIAL.'
            : `Sets up staking, reserves ${registrationStorageReserve} NEAR for storage, stakes and delegates your SOCIAL.`
        : `You need ${depositNeeded} more SOCIAL in your wallet before you can open this proposal.`;
      nextActionLabel = canCoverDeposit
        ? 'Prepare governance'
        : `Add ${depositNeeded} SOCIAL`;
      nextActionNote = '';
      nextActionHandler = onPrepare;
      nextActionDisabled = acting || !canCoverDeposit || !onPrepare;
      nextActionKind = canCoverDeposit ? 'prepare' : null;
    } else if (eligibility.delegateNeeded !== '0') {
      nextActionTitle = `Delegate ${delegateNeeded} SOCIAL`;
      nextActionBody = `Delegate your remaining ${delegateNeeded} SOCIAL to unlock proposal access.`;
      nextActionLabel = `Delegate ${delegateNeeded} SOCIAL`;
      nextActionNote = '';
      nextActionHandler = onPrepare;
      nextActionDisabled = acting || !onPrepare;
      nextActionKind = 'prepare';
    } else {
      nextActionTitle = 'Almost there';
      nextActionBody =
        'Looks good — hit refresh to confirm your latest balance.';
      nextActionLabel = 'Refresh';
      nextActionNote = '';
      nextActionHandler = onRefresh;
      nextActionDisabled = acting || !onRefresh;
    }
  }

  return (
    <div className="px-1 py-2 md:px-2 md:py-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Proposal Setup
        </h2>
        <div className="flex items-center gap-2">
          {eligibility?.canPropose ? (
            <PortalBadge accent="green" size="sm" className="h-8">
              Ready
            </PortalBadge>
          ) : (
            <PortalBadge accent="slate" size="sm" className="h-8">
              In Progress
            </PortalBadge>
          )}
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={acting || refreshPending}
              title={
                refreshPending ? 'Refreshing balances' : 'Refresh balances'
              }
              aria-label="Refresh balances"
              className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshPending ? 'animate-spin' : ''}`}
              />
            </Button>
          )}
        </div>
      </div>

      {/* ── Delegation Hero ── */}
      <div className="mt-4 flex flex-col items-center py-2 text-center">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Delegated
        </span>
        <p
          className={cn(
            'mt-1 font-mono text-3xl font-bold tabular-nums tracking-[-0.03em] md:text-4xl',
            eligibility?.canPropose ? 'portal-green-text' : 'portal-blue-text'
          )}
        >
          {delegatedWeight}
        </p>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground opacity-70">
          SOCIAL
        </span>
        <p className="mt-1.5 max-w-xs text-[13px] text-muted-foreground">
          {proposalSetupSummary}
        </p>
      </div>

      {/* ── Metrics ── */}
      <StatStrip groupClassName="mt-2">
        <StatStripCell label="Threshold" showDivider>
          <p className="portal-slate-text font-mono text-sm font-semibold tracking-tight md:text-base">
            {requiredWeight} SOCIAL
          </p>
        </StatStripCell>
        {eligibility && !eligibility.canPropose && (
          <StatStripCell label="Wallet" showDivider>
            <p className="font-mono text-sm font-semibold tracking-tight md:text-base">
              {walletBalance}
            </p>
          </StatStripCell>
        )}
        <StatStripCell label="Bond">
          <span
            className={cn(
              'font-mono text-sm font-medium tracking-tight md:text-base',
              canCoverProposalBond ? 'portal-green-text' : 'portal-amber-text'
            )}
          >
            {canCoverProposalBond
              ? `${proposalBondDisplay} NEAR`
              : `${nearBalance} / ${proposalBondDisplay} NEAR`}
          </span>
        </StatStripCell>
      </StatStrip>

      {!eligibility && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <PulsingDots size="sm" /> Checking things out…
        </div>
      )}

      {eligibility && (
        <div className="mt-4 border-t border-fade-detail pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            What's next
          </p>
          <h4 className="mt-1.5 text-base font-semibold tracking-[-0.02em]">
            {nextActionTitle}
          </h4>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {nextActionBody}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={acting}
                size="default"
                className="w-full sm:w-auto"
                loading={acting && actionKind === 'cancel'}
              >
                <ArrowLeft className={`h-4 w-4 ${buttonArrowLeftClass}`} />
                Back to form
              </Button>
            )}
            <Button
              type="button"
              onClick={nextActionHandler}
              disabled={nextActionDisabled}
              size="default"
              className="w-full sm:w-auto"
              loading={acting && actionKind === nextActionKind}
            >
              {nextActionLabel}
            </Button>
            {eligibility.canPropose &&
              eligibility.availableToWithdraw !== '0' &&
              !eligibility.isInCooldown &&
              onWithdrawExcess && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onWithdrawExcess}
                  disabled={acting}
                  size="default"
                  className="w-full sm:w-auto"
                  loading={acting && actionKind === 'withdraw'}
                >
                  {`Withdraw ${withdrawableAmount} SOCIAL`}
                </Button>
              )}
          </div>
          {nextActionNote && (
            <p className="mt-2 text-xs text-muted-foreground">
              {nextActionNote}
            </p>
          )}
        </div>
      )}

      {eligibility && (
        <StatStrip groupClassName="mt-4">
          <StatStripCell label="DAO" showDivider size="md">
            <a
              href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${eligibility.daoAccountId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-action-link inline-flex items-center gap-1.5 text-sm"
            >
              View
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </StatStripCell>
          <StatStripCell label="Staking" showDivider size="md">
            {eligibility.stakingContractId ? (
              <a
                href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${eligibility.stakingContractId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="portal-action-link inline-flex items-center gap-1.5 text-sm"
              >
                View
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">Unavailable</span>
            )}
          </StatStripCell>
          <StatStripCell label="Position" size="md">
            <Link
              href="/governance/manage"
              className="portal-action-link inline-flex items-center gap-1.5 text-sm"
            >
              Manage
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </StatStripCell>
        </StatStrip>
      )}

      {actionError && (
        <p className="portal-red-text mt-4 text-sm">{actionError}</p>
      )}
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
    viewContract<OnChainAppConfig>('get_app_config', {
      app_id: registration.appId,
    })
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
            <Button
              onClick={() => setShowRotateConfirm(true)}
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs"
              title="Rotate API key"
              disabled={!hasApiKey}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rotate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            App:{' '}
            <span className="font-mono text-foreground">
              {registration.appId}
            </span>
            {' · '}
            Label:{' '}
            <span className="text-foreground">{registration.label}</span>
          </p>
          <div className="relative">
            <code className="portal-green-text block break-all rounded-[1rem] border border-border/50 bg-background/50 px-3 py-2.5 pr-[4.5rem] font-mono text-xs md:px-4 md:py-3 md:text-sm select-none">
              {hasApiKey && keyRevealed ? registration.apiKey : maskedKey}
            </code>
            {hasApiKey && (
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                <button
                  onClick={() => setKeyRevealed((value) => !value)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                  title={keyRevealed ? 'Hide key' : 'Reveal key'}
                >
                  {keyRevealed ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
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
                          <CodeBlock code={installSnippet(tab)} language="bash" />
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
                              A <code className="portal-blue-text">BOT_TOKEN</code>{' '}
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
                            title={tab === 'bot' ? 'Create bot.ts' : 'Use the SDK'}
                          />
                          <CodeBlock
                            code={tab === 'bot' ? botSnippet() : sdkOnlySnippet()}
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
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              <MessageSquare className="portal-blue-icon mr-1.5 inline h-3.5 w-3.5" />
                              Preview
                            </p>
                            <p className="mb-4 text-xs text-muted-foreground">
                              How your bot looks in Telegram — fully branded, zero custom code.
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                  /start
                                </p>
                                <div className="rounded-[1rem] border border-white/5 bg-[#151827] p-3 text-sm font-mono leading-relaxed text-gray-200 shadow-inner shadow-black/10 space-y-1">
                                  <p>🤝 OnSocial stands with {registration.label}</p>
                                  <p className="mt-2">👋 Welcome!</p>
                                  <p className="mt-2 text-gray-400">
                                    Earn 0.1 SOCIAL per message (up to 1/day) for being active
                                    in the group.
                                  </p>
                                  <p className="mt-1 text-gray-400">
                                    Tap below to link your NEAR account and start earning 👇
                                  </p>
                                  <div className="mt-3 flex gap-2">
                                    <PreviewPill accent="blue">🔗 Link Account</PreviewPill>
                                    <PreviewPill>❓ How it works</PreviewPill>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                  /balance
                                </p>
                                <div className="rounded-[1rem] border border-white/5 bg-[#151827] p-3 text-sm font-mono leading-relaxed text-gray-200 shadow-inner shadow-black/10 space-y-1">
                                  <p>🤝 OnSocial stands with {registration.label}</p>
                                  <p className="mt-2">
                                    ⭐ Rewards for{' '}
                                    <span className="portal-green-text">alice.near</span>
                                  </p>
                                  <p className="mt-2">💎 Unclaimed: 12.5 SOCIAL</p>
                                  <p className="portal-green-text text-xs">
                                    (ready to claim!)
                                  </p>
                                  <p className="mt-1 text-gray-400">
                                    📈 Daily progress: 0.5 / 1 SOCIAL
                                  </p>
                                  <p className="mt-1">🏆 Total earned: 42 SOCIAL</p>
                                  <div className="mt-3 flex gap-2">
                                    <PreviewPill accent="purple">💎 Claim</PreviewPill>
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
                    Reveal the full key to unlock the setup guide, .env downloads, and
                    key rotation.
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
