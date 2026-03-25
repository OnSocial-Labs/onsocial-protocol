'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  Code2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Sparkles,
  MessageSquare,
  RefreshCw,
  Rocket,
  Shield,
  Terminal,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { RiTelegram2Line } from 'react-icons/ri';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/ui/button';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  viewContract,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
  type OnChainAppConfig,
} from '@/lib/near-rpc';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';
import { portalColors, portalFrameStyle } from '@/lib/portal-colors';
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

function formatSocialAmount(value: string, maximumFractionDigits = 2): string {
  const numeric = Number(yoctoToSocial(value));
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(numeric);
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
  const explorerHref = proposal?.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${proposal.tx_hash}`
    : null;

  return (
    <div className="rounded-[1.5rem] border border-border/50 bg-background/30 px-6 py-12 text-center">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {isEligibility
          ? 'Eligibility'
          : isReady
            ? 'Proposal Ready'
            : isGovernance
              ? 'In Governance'
              : 'Under Review'}
      </p>
      <Clock className="portal-blue-icon mx-auto mb-4 h-16 w-16" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        {isEligibility
          ? 'Proposal access'
          : isReady
            ? 'Proposal ready'
            : isGovernance
              ? 'Proposal in governance'
              : 'Application received'}
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

      {proposal?.description && (
        <p className="mx-auto mb-4 max-w-xl text-sm text-muted-foreground">
          Proposal:{' '}
          <span className="text-foreground">{proposal.description}</span>
        </p>
      )}

      {isEligibility && (
        <p className="text-sm text-muted-foreground">
          A quick check confirms whether this wallet has enough delegated
          governance weight for the final DAO proposal.
        </p>
      )}

      {isReady && onSubmitProposal && (
        <div className="space-y-3">
          <Button onClick={onSubmitProposal} disabled={acting} size="lg">
            {acting ? 'Opening wallet…' : 'Open DAO Proposal'}
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
            Once executed, a quick wallet confirmation reveals the API key for
            this app.
          </p>
          {explorerHref && (
            <a
              href={explorerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-action-link inline-flex items-center gap-1.5 text-sm"
            >
              Open transaction
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
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
  appId,
  label,
  eligibility,
  acting = false,
  actionLabel = '',
  actionError = '',
  onRefresh,
  onRegister,
  onDeposit,
  onDelegate,
  onSubmitProposal,
}: {
  appId: string;
  label: string;
  eligibility: GovernanceEligibilitySnapshot | null;
  acting?: boolean;
  actionLabel?: string;
  actionError?: string;
  onRefresh?: () => void | Promise<void>;
  onRegister?: () => void | Promise<void>;
  onDeposit?: () => void | Promise<void>;
  onDelegate?: () => void | Promise<void>;
  onSubmitProposal?: () => void | Promise<void>;
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
  const canCoverDeposit = eligibility
    ? BigInt(eligibility.walletBalance) >= BigInt(eligibility.depositNeeded)
    : false;

  let nextActionTitle = 'Checking governance setup';
  let nextActionBody =
    'We are checking what this wallet still needs before the proposal can open.';
  let nextActionLabel = 'Checking status…';
  let nextActionNote = '';
  let nextActionHandler = onRefresh;
  let nextActionDisabled = acting || !onRefresh;

  if (eligibility) {
    if (eligibility.canPropose) {
      nextActionTitle = 'Open your application proposal';
      nextActionBody =
        'This wallet already has enough delegated SOCIAL to open the proposal in the DAO.';
      nextActionLabel = 'Open proposal';
      nextActionNote = `${delegatedWeight} delegated SOCIAL is ready on this wallet.`;
      nextActionHandler = onSubmitProposal;
      nextActionDisabled = acting || !onSubmitProposal;
    } else if (!eligibility.isRegistered) {
      nextActionTitle = 'Connect this wallet to governance';
      nextActionBody =
        'Register this wallet once so it can hold and delegate the SOCIAL needed to continue.';
      nextActionLabel = 'Register wallet';
      nextActionNote = `Storage deposit: ${eligibility.storageDeposit} yoctoNEAR.`;
      nextActionHandler = onRegister;
      nextActionDisabled = acting || !onRegister;
    } else if (eligibility.depositNeeded !== '0') {
      nextActionTitle = 'Add the SOCIAL needed to continue';
      nextActionBody =
        'Deposit only the missing SOCIAL needed before this wallet can open the proposal.';
      nextActionLabel = canCoverDeposit
        ? `Deposit ${depositNeeded} SOCIAL`
        : `Need ${depositNeeded} SOCIAL`;
      nextActionNote = canCoverDeposit
        ? `${walletBalance} SOCIAL is available in this wallet.`
        : `This wallet still needs ${depositNeeded} SOCIAL before it can continue.`;
      nextActionHandler = onDeposit;
      nextActionDisabled = acting || !canCoverDeposit || !onDeposit;
    } else if (eligibility.delegateNeeded !== '0') {
      nextActionTitle = 'Delegate the required SOCIAL to this wallet';
      nextActionBody =
        'Assign the staked SOCIAL back to this wallet so it counts toward opening the proposal.';
      nextActionLabel = `Delegate ${delegateNeeded} SOCIAL`;
      nextActionNote = `${availableToDelegate} SOCIAL is ready to delegate from governance staking.`;
      nextActionHandler = onDelegate;
      nextActionDisabled = acting || !onDelegate;
    } else {
      nextActionTitle = 'Refresh governance status';
      nextActionBody =
        'This wallet looks almost ready. Refresh once to confirm the latest delegated balance before opening the proposal.';
      nextActionLabel = 'Refresh';
      nextActionNote = `${remainingWeight} SOCIAL still shows as missing on the latest check.`;
      nextActionHandler = onRefresh;
      nextActionDisabled = acting || !onRefresh;
    }
  }

  return (
    <div className="rounded-[1.5rem] border border-border/50 bg-background/30 px-6 py-8 md:px-8 md:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Proposal Setup
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em]">
            Final step for {label}
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            App <span className="portal-blue-text font-mono">{appId}</span>{' '}
            already has a draft. This wallet needs at least {requiredWeight}{' '}
            delegated SOCIAL before it can open the proposal.
          </p>
        </div>
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            onClick={onRefresh}
            disabled={acting}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Required
          </p>
          <p className="mt-2 text-2xl font-semibold">{requiredWeight}</p>
          <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
        </div>
        <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Delegated To You
          </p>
          <p className="mt-2 text-2xl font-semibold">{delegatedWeight}</p>
          <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
        </div>
        <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Ready To Delegate
          </p>
          <p className="mt-2 text-2xl font-semibold">{availableToDelegate}</p>
          <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
        </div>
        <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Wallet Balance
          </p>
          <p className="mt-2 text-2xl font-semibold">{walletBalance}</p>
          <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
        </div>
      </div>

      {!eligibility && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <PulsingDots size="sm" /> Checking governance status…
        </div>
      )}

      {eligibility && (
        <div className="mt-6 space-y-4">
          <div className="rounded-[1.25rem] border border-border/50 bg-background/45 p-5 md:p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Current Action
            </p>
            <h4 className="mt-2 text-lg font-semibold tracking-[-0.02em]">
              {nextActionTitle}
            </h4>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {nextActionBody}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={nextActionHandler}
                disabled={nextActionDisabled}
                size="lg"
              >
                {nextActionLabel}
              </Button>
              {nextActionNote && (
                <p className="text-xs text-muted-foreground">
                  {nextActionNote}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Required
              </p>
              <p className="mt-2 text-2xl font-semibold">{requiredWeight}</p>
              <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
            </div>
            <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Delegated Here
              </p>
              <p className="mt-2 text-2xl font-semibold">{delegatedWeight}</p>
              <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
            </div>
            <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Ready To Delegate
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {availableToDelegate}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
            </div>
            <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Wallet Balance
              </p>
              <p className="mt-2 text-2xl font-semibold">{walletBalance}</p>
              <p className="mt-1 text-xs text-muted-foreground">SOCIAL</p>
            </div>
          </div>

          <div className="rounded-[1rem] border border-border/50 bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Need a closer look?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Remaining to unlock this proposal: {remainingWeight} SOCIAL.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <a
                  href={`${ACTIVE_NEAR_EXPLORER_URL}/accounts/${eligibility.daoAccountId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-action-link inline-flex items-center gap-1.5"
                >
                  View DAO
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {eligibility.stakingContractId && (
                  <a
                    href={`${ACTIVE_NEAR_EXPLORER_URL}/accounts/${eligibility.stakingContractId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-link inline-flex items-center gap-1.5"
                  >
                    View governance staking
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {actionLabel && (
        <p className="mt-4 text-sm text-muted-foreground">{actionLabel}</p>
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
    <div className="rounded-[1.5rem] border border-border/50 bg-background/30 px-6 py-12 text-center">
      <div className="mb-4 flex justify-center">
        <span className="portal-red-badge rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em]">
          Review Update
        </span>
      </div>
      <XCircle className="portal-red-icon w-16 h-16 mx-auto mb-4" />
      <h3 className="text-xl font-semibold mb-2 tracking-[-0.02em]">
        Not approved this round
      </h3>
      <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
        The application for{' '}
        <span className="font-semibold text-foreground">{label}</span> (
        <span className="portal-blue-text font-mono">{appId}</span>) was not
        approved at this time.
      </p>
      <p className="text-sm text-muted-foreground">
        For feedback before reapplying, contact OnSocial on{' '}
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
  onKeyRotated,
}: {
  registration: AppRegistration;
  onKeyRotated?: (_newKey: string) => void;
}) {
  const { accountId } = useWallet();
  const [tab, setTab] = useState<'bot' | 'sdk'>('bot');
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState('');
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(true);

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
    if (!accountId) return;
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
    <div className="space-y-8">
      <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border"
            style={portalFrameStyle('green')}
          >
            <Key className="portal-green-icon w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold tracking-[-0.02em]">OnApi key</h3>
              <button
                onClick={() => setShowRotateConfirm(true)}
                className="portal-purple-surface inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                title="Rotate API key"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rotate
              </button>
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
              <code className="portal-green-text block break-all rounded-[1rem] border border-border/50 bg-background/50 px-4 py-3 pr-20 font-mono text-sm select-none">
                {keyRevealed
                  ? registration.apiKey
                  : `${registration.apiKey.slice(0, 10)}${'•'.repeat(32)}${registration.apiKey.slice(-4)}`}
              </code>
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                <button
                  onClick={() => setKeyRevealed((value) => !value)}
                  className="p-1.5 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                  title={keyRevealed ? 'Hide key' : 'Reveal key'}
                >
                  {keyRevealed ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
                <CopyButton text={registration.apiKey} className="" />
              </div>
            </div>
            <p className="portal-amber-text text-xs mt-2">
              Keep this private and store it somewhere safe.
            </p>

            {showRotateConfirm && (
              <div className="portal-amber-panel mt-4 rounded-[1rem] border p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="portal-amber-icon w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">Rotate key?</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      The current key stops working immediately. Update the
                      bot&apos;s
                      <code className="portal-blue-text">
                        {' '}
                        ONSOCIAL_API_KEY
                      </code>{' '}
                      env var with the new value.
                    </p>
                    {rotateError && (
                      <p className="portal-red-text text-xs mb-3">
                        {rotateError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleRotate}
                        disabled={rotating}
                        size="sm"
                        className="font-medium text-xs"
                      >
                        {rotating ? (
                          <>
                            <PulsingDots size="sm" className="mr-1.5" />
                            Rotating…
                          </>
                        ) : (
                          'Rotate key'
                        )}
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
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="portal-purple-icon h-4 w-4" />
          <span>App Rules · On-Chain</span>
        </h3>
        {configLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PulsingDots size="sm" /> Loading…
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

      <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Setup Guide
        </h3>
        <div className="mb-4 flex max-w-xs gap-1 rounded-full border border-border/50 bg-muted/20 p-1">
          <button
            onClick={() => setTab('bot')}
            className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              tab === 'bot' ? 'portal-blue-surface' : 'portal-neutral-control'
            }`}
          >
            <Terminal className="w-4 h-4 inline mr-1.5" />
            Telegram Bot
          </button>
          <button
            onClick={() => setTab('sdk')}
            className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              tab === 'sdk' ? 'portal-blue-surface' : 'portal-neutral-control'
            }`}
          >
            <Code2 className="w-4 h-4 inline mr-1.5" />
            SDK Only
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
              1
            </span>
            Install
          </div>
          <CodeBlock code={installSnippet(tab)} language="bash" />
        </div>

        <div className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
                2
              </span>
              Add .env
            </div>
            <DownloadButton
              filename=".env"
              content={envSnippet(registration.appId, registration.apiKey, tab)}
              label="Download .env"
            />
          </div>
          <CodeBlock
            code={envSnippet(registration.appId, registration.apiKey, tab, {
              maskApiKey: true,
            })}
            language="bash"
          />
          {tab === 'bot' && (
            <p className="text-xs text-muted-foreground">
              A <code className="portal-blue-text">BOT_TOKEN</code> comes from{' '}
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

        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
              3
            </span>
            {tab === 'bot' ? 'Create bot.ts' : 'Use the SDK'}
          </div>
          <CodeBlock code={tab === 'bot' ? botSnippet() : sdkOnlySnippet()} />
        </div>

        <div className="space-y-4 mt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-6 h-6 rounded-full border border-border/50 flex items-center justify-center text-xs">
              4
            </span>
            Run
          </div>
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
          <div className="mt-6 border-t border-border/30 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium mb-1">
                  Download starter project
                </h4>
                <p className="text-xs text-muted-foreground">
                  package.json + .env + bot.ts, ready for{' '}
                  <code className="portal-blue-text">
                    npm install &amp;&amp; npm start
                  </code>
                </p>
              </div>
              <div className="flex gap-2">
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
                    registration.apiKey,
                    'bot'
                  )}
                  label=".env"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {tab === 'bot' && (
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Deploy
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            A persistent process is needed for a Telegram bot. One example:
          </p>
          <a
            href="https://fly.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-[1.25rem] border border-border/50 bg-background/30 p-4 transition-colors hover:border-border"
          >
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border"
              style={portalFrameStyle('purple')}
            >
              <Cloud className="portal-purple-icon w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">Fly.io</h4>
              <p className="text-xs text-muted-foreground">
                Push to GitHub for an always-on deploy. Free tier available.
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </a>
        </div>
      )}

      {tab === 'bot' && (
        <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <MessageSquare className="portal-blue-icon mr-2 inline h-5 w-5" />
            Preview
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            This is how your bot will look in Telegram — fully branded, zero
            custom code needed.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-border/50 bg-background/30 p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                /start
              </p>
              <div className="rounded-[1rem] border border-white/5 bg-[#151827] p-3 text-sm font-mono leading-relaxed text-gray-200 shadow-inner shadow-black/10 space-y-1">
                <p>🤝 OnSocial stands with {registration.label}</p>
                <p className="mt-2">👋 Welcome!</p>
                <p className="mt-2 text-gray-400">
                  Earn 0.1 SOCIAL per message (up to 1/day) for being active in
                  the group.
                </p>
                <p className="mt-1 text-gray-400">
                  Tap below to link your NEAR account and start earning 👇
                </p>
                <div className="mt-3 flex gap-2">
                  <span className="portal-blue-badge rounded-full border px-2.5 py-1 text-xs">
                    🔗 Link Account
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400">
                    ❓ How it works
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-border/50 bg-background/30 p-4">
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
                <p className="portal-green-text text-xs">(ready to claim!)</p>
                <p className="mt-1 text-gray-400">
                  📈 Daily progress: 0.5 / 1 SOCIAL
                </p>
                <p className="mt-1">🏆 Total earned: 42 SOCIAL</p>
                <div className="mt-3 flex gap-2">
                  <span className="portal-purple-badge rounded-full border px-2.5 py-1 text-xs">
                    💎 Claim
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400">
                    🔄 Refresh
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            icon: Zap,
            title: 'Auto-rewarding',
            desc: 'Messages in groups earn SOCIAL tokens automatically',
            color: portalColors.green,
          },
          {
            icon: Shield,
            title: 'Seamless claims',
            desc: 'Users claim rewards in-bot without gas fees or wallet popups.',
            color: portalColors.blue,
          },
          {
            icon: Users,
            title: 'Account linking',
            desc: '/start → link NEAR account → start earning',
            color: portalColors.purple,
          },
          {
            icon: Rocket,
            title: 'Branded UX',
            desc: `"🤝 OnSocial stands with ${registration.label}"`,
            color: portalColors.green,
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-[1.25rem] border border-border/50 bg-background/30 p-4 transition-colors hover:border-border"
          >
            <item.icon className="w-5 h-5 mb-2" style={{ color: item.color }} />
            <h4 className="font-medium text-sm mb-1">{item.title}</h4>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center pt-4">
        <a
          href="https://github.com/OnSocial-Labs/onsocial-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          Full SDK documentation
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
