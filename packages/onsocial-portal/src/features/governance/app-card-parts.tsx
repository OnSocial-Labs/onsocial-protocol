'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Link2,
  XCircle,
} from 'lucide-react';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
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
    { badgeClass: string; iconClass: string; icon: typeof Clock }
  > = {
    pending: {
      badgeClass: 'portal-amber-badge',
      iconClass: 'portal-amber-icon',
      icon: Clock,
    },
    approved: {
      badgeClass: 'portal-green-badge',
      iconClass: 'portal-green-icon',
      icon: CheckCircle2,
    },
    ready_for_governance: {
      badgeClass: 'portal-blue-badge',
      iconClass: 'portal-blue-icon',
      icon: Link2,
    },
    proposal_submitted: {
      badgeClass: 'portal-blue-badge',
      iconClass: 'portal-blue-icon',
      icon: Link2,
    },
    rejected: {
      badgeClass: 'portal-red-badge',
      iconClass: 'portal-red-icon',
      icon: XCircle,
    },
    reopened: {
      badgeClass: 'portal-blue-badge',
      iconClass: 'portal-blue-icon',
      icon: Link2,
    },
  };
  const resolved = styles[status] ?? styles.pending;
  const Icon = resolved.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${resolved.badgeClass}`}
    >
      <Icon className={`w-3 h-3 ${resolved.iconClass}`} />
      {status}
    </span>
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
      <div className="portal-blue-panel mb-4 rounded-[1rem] border p-4">
        <div className="flex items-center gap-2">
          <PulsingDots size="md" className="portal-blue-text" />
          <span className="text-sm">
            Preparing governance record for{' '}
            <span className="font-mono">{appId}</span>…
          </span>
        </div>
      </div>
    );
  }

  if (creationStatus === 'error') {
    return (
      <div className="portal-red-panel mb-4 rounded-[1rem] border p-4">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="portal-red-icon w-4 h-4" />
          <span className="text-sm font-semibold">
            Governance state update failed
          </span>
        </div>
        <p className="portal-red-text text-xs">{creationError}</p>
      </div>
    );
  }

  if (!proposal) {
    return null;
  }

  const proposalLabel =
    proposal.proposal_id !== null
      ? `Proposal #${proposal.proposal_id}`
      : 'Proposal Draft';
  const txHref = proposal.tx_hash
    ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${proposal.tx_hash}`
    : null;

  if (proposal.status === 'submitted' || creationStatus === 'submitted') {
    return (
      <div className="portal-green-panel mb-4 rounded-[1rem] border p-4">
        <div className="flex items-center gap-2">
          <Link2 className="portal-green-icon w-4 h-4" />
          <span className="text-sm font-semibold">
            {proposalLabel} submitted
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Submitted to <span className="font-mono">{proposal.dao_account}</span>{' '}
          for <span className="font-mono">register_app</span> on{' '}
          <span className="font-mono">{REWARDS_CONTRACT}</span>.
        </p>
        {proposal.description && (
          <p className="text-xs text-muted-foreground/80 mt-1">
            {proposal.description}
          </p>
        )}
        {txHref && (
          <a
            href={txHref}
            target="_blank"
            rel="noreferrer"
            className="portal-green-text mt-2 inline-flex text-xs font-medium underline-offset-4 hover:underline"
          >
            View transaction
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="portal-amber-panel mb-4 rounded-[1rem] border p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="portal-amber-icon w-4 h-4" />
        <span className="text-sm font-semibold">Ready for governance</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        <span className="font-mono">{appId}</span> is waiting for the proposer
        wallet to submit the stored proposal to{' '}
        <span className="font-mono">{proposal.dao_account}</span>.
      </p>
      {proposal.description && (
        <p className="text-xs text-muted-foreground/80 mt-1">
          {proposal.description}
        </p>
      )}
    </div>
  );
}

export function ApprovedConfigPanel({
  configLoading,
  onChainConfig,
}: {
  configLoading: boolean;
  onChainConfig: OnChainAppConfig | null;
}) {
  return (
    <div className="mt-4 rounded-[1.25rem] border border-border/50 bg-background/30 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        On-Chain Config · {REWARDS_CONTRACT}
      </p>
      {configLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <PulsingDots size="sm" /> Loading…
        </div>
      )}
      {!configLoading && !onChainConfig && (
        <p className="portal-amber-text text-xs">
          <AlertTriangle className="portal-amber-icon w-3 h-3 inline mr-1" />
          Not registered on-chain yet.
        </p>
      )}
      {!configLoading && onChainConfig && (
        <OnChainConfigSummary config={onChainConfig} />
      )}
    </div>
  );
}
