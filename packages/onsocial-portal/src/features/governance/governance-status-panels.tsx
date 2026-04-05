'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Link2,
  XCircle,
} from 'lucide-react';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
import { PortalBadge } from '@/components/ui/portal-badge';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import type {
  GovernanceCreationStatus,
  GovernanceProposal,
} from '@/features/governance/types';
import { REWARDS_CONTRACT, type OnChainAppConfig } from '@/lib/near-rpc';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/portal-config';

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<
    string,
    {
      accent: 'amber' | 'green' | 'blue' | 'red';
      icon: typeof Clock;
      label: string;
    }
  > = {
    pending: {
      accent: 'amber',
      icon: Clock,
      label: 'Pending',
    },
    approved: {
      accent: 'green',
      icon: CheckCircle2,
      label: 'Approved',
    },
    ready_for_governance: {
      accent: 'blue',
      icon: Link2,
      label: 'Ready to submit',
    },
    proposal_submitted: {
      accent: 'blue',
      icon: Link2,
      label: 'In governance',
    },
    rejected: {
      accent: 'red',
      icon: XCircle,
      label: 'Rejected',
    },
    reopened: {
      accent: 'blue',
      icon: Link2,
      label: 'Reopened',
    },
  };
  const resolved = styles[status] ?? styles.pending;
  const Icon = resolved.icon;

  return (
    <PortalBadge accent={resolved.accent} casing="capitalize" className="gap-1">
      <Icon className="h-3 w-3" />
      {resolved.label}
    </PortalBadge>
  );
}

export function GovernanceStatusPanel({
  appId,
  proposal,
  creationStatus,
  creationError,
}: {
  appId: string;
  proposal: GovernanceProposal | null;
  creationStatus: GovernanceCreationStatus;
  creationError: string;
}) {
  if (creationStatus === 'idle' && !proposal) return null;

  if (creationStatus === 'creating') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <PulsingDots size="md" className="portal-blue-text" />
        <span className="text-muted-foreground">
          Preparing governance for{' '}
          <span className="font-mono text-foreground">{appId}</span>
        </span>
      </div>
    );
  }

  if (creationStatus === 'error') {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <XCircle className="portal-red-icon h-4 w-4 shrink-0" />
          <span className="font-medium text-foreground">
            Submission needs attention
          </span>
        </div>
        {creationError && (
          <p className="portal-red-text text-sm">{creationError}</p>
        )}
      </div>
    );
  }

  if (!proposal) {
    return null;
  }

  const txHref = proposal.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${proposal.tx_hash}`
    : null;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        <span className="break-all font-mono text-xs text-foreground/70">
          {proposal.dao_account}
        </span>
        {proposal.proposal_id !== null && (
          <span className="ml-2 font-mono text-xs text-foreground/70">
            #{proposal.proposal_id}
          </span>
        )}
      </p>
      {txHref && (
        <a
          href={txHref}
          target="_blank"
          rel="noreferrer"
          className="portal-action-link inline-flex items-center gap-1.5 text-xs font-medium"
        >
          View submission
          <Link2 className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export function ApprovedConfigPanel({
  configLoading,
  onChainConfig,
  showUsageMetrics = true,
}: {
  configLoading: boolean;
  onChainConfig: OnChainAppConfig | null;
  showUsageMetrics?: boolean;
}) {
  const title = configLoading
    ? 'On-chain config'
    : onChainConfig
      ? 'On-chain'
      : 'Config pending';

  return (
    <section className="mt-3 border-t border-fade-section pt-3">
      <div className="flex items-baseline gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </p>
        {!configLoading && onChainConfig && (
          <p className="text-xs text-muted-foreground">— {REWARDS_CONTRACT}</p>
        )}
      </div>
      {configLoading && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <PulsingDots size="sm" /> Loading…
        </div>
      )}
      {!configLoading && !onChainConfig && (
        <p className="mt-2 portal-amber-text text-xs">
          <AlertTriangle className="portal-amber-icon mr-1 inline h-3.5 w-3.5" />
          Not registered on-chain yet.
        </p>
      )}
      {!configLoading && onChainConfig && (
        <div className="mt-2">
          <OnChainConfigSummary
            config={onChainConfig}
            showUsageMetrics={showUsageMetrics}
          />
        </div>
      )}
    </section>
  );
}
