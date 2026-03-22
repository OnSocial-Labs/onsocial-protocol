'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Link2, XCircle } from 'lucide-react';
import { OnChainConfigSummary } from '@/components/data/on-chain-config-summary';
import { Button } from '@/components/ui/button';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  CONTRACT_OWNER_WALLET,
  RELAYER_ACCOUNT,
} from '@/features/admin/constants';
import {
  cleanNumeric,
  normalizeNumeric,
  validateParams,
} from '@/features/admin/param-utils';
import type {
  Application,
  ChainStatus,
  ContractParams,
  ParamErrors,
} from '@/features/admin/types';
import { REWARDS_CONTRACT, type OnChainAppConfig } from '@/lib/near-rpc';

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<
    string,
    { badgeClass: string; iconClass: string; icon: typeof Clock }
  > = {
    pending: { badgeClass: 'portal-amber-badge', iconClass: 'portal-amber-icon', icon: Clock },
    approved: {
      badgeClass: 'portal-green-badge',
      iconClass: 'portal-green-icon',
      icon: CheckCircle2,
    },
    rejected: { badgeClass: 'portal-red-badge', iconClass: 'portal-red-icon', icon: XCircle },
    reopened: { badgeClass: 'portal-blue-badge', iconClass: 'portal-blue-icon', icon: Link2 },
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

function ParamField({
  label,
  hint,
  value,
  onChange,
  suffix,
  error,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (_value: string) => void;
  suffix?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(cleanNumeric(e.target.value))}
          onBlur={() => onChange(normalizeNumeric(value))}
          className={`flex-1 rounded-xl border bg-muted/20 px-3 py-2 outline-none transition-colors text-sm font-mono ${
            error
              ? 'border-[var(--portal-red)] focus:border-[var(--portal-red)]'
              : 'border-border/50 focus:border-[var(--portal-blue-focus-border)]'
          }`}
        />
        {suffix && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
      {error ? (
        <p className="portal-red-text text-[11px] mt-0.5">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

function useParamUpdater({
  setParams,
  setErrors,
}: {
  setParams: React.Dispatch<React.SetStateAction<ContractParams>>;
  setErrors: React.Dispatch<React.SetStateAction<ParamErrors>>;
}) {
  return (key: keyof ContractParams, value: string) => {
    setParams((current) => {
      const next = { ...current, [key]: value };
      setErrors(validateParams(next));
      return next;
    });
  };
}

export function PendingControls({
  app,
  isContractOwner,
  params,
  setParams,
  paramErrors,
  setParamErrors,
  notes,
  setNotes,
  error,
  acting,
  onApprove,
  onReject,
}: {
  app: Application;
  isContractOwner: boolean;
  params: ContractParams;
  setParams: React.Dispatch<React.SetStateAction<ContractParams>>;
  paramErrors: ParamErrors;
  setParamErrors: React.Dispatch<React.SetStateAction<ParamErrors>>;
  notes: string;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  error: string;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const updateParam = useParamUpdater({
    setParams,
    setErrors: setParamErrors,
  });

  return (
    <>
      <div className="mb-4 rounded-[1.25rem] border border-border/50 bg-background/30 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Contract Registration · {REWARDS_CONTRACT}
        </p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">app_id</span>
            <p className="font-mono text-foreground">{app.app_id}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">label</span>
            <p className="text-foreground">{app.label}</p>
          </div>
        </div>

        {isContractOwner && (
          <div className="space-y-3 border-t border-border/30 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <ParamField
                label="reward_per_action"
                hint="SOCIAL tokens per reward action"
                value={params.rewardPerAction}
                onChange={(value) => updateParam('rewardPerAction', value)}
                suffix="SOCIAL"
                error={paramErrors.rewardPerAction}
              />
              <ParamField
                label="daily_cap"
                hint="Max SOCIAL a user can earn per day"
                value={params.dailyCap}
                onChange={(value) => updateParam('dailyCap', value)}
                suffix="SOCIAL"
                error={paramErrors.dailyCap}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ParamField
                label="total_budget"
                hint="Lifetime token budget for this app (required)"
                value={params.totalBudget}
                onChange={(value) => updateParam('totalBudget', value)}
                suffix="SOCIAL"
                error={paramErrors.totalBudget}
              />
              <ParamField
                label="daily_budget"
                hint="Aggregate daily budget (0 = unlimited)"
                value={params.dailyBudget}
                onChange={(value) => updateParam('dailyBudget', value)}
                suffix="SOCIAL"
                error={paramErrors.dailyBudget}
              />
            </div>

            <div className="text-xs text-muted-foreground">
              <span className="font-medium">authorized_callers:</span>{' '}
              <span className="portal-blue-text font-mono">{RELAYER_ACCOUNT}</span>
              <span className="text-muted-foreground/60 ml-1">
                (relayer — auto-set)
              </span>
            </div>
          </div>
        )}

        {!isContractOwner && (
          <p className="portal-amber-text text-xs mt-2">
            <AlertTriangle className="portal-amber-icon w-3 h-3 inline mr-1" />
            Connect as{' '}
            <span className="portal-purple-text font-mono">
              {CONTRACT_OWNER_WALLET}
            </span>{' '}
            to configure and register on-chain.
          </p>
        )}
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Admin Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes…"
          rows={2}
          className="portal-blue-focus w-full resize-none rounded-[1rem] border border-border/50 bg-muted/20 px-3 py-2.5 text-sm outline-none"
        />
      </div>

      {error && <p className="portal-red-text text-xs mb-2">{error}</p>}

      <div className="flex gap-2">
        <Button
          onClick={onApprove}
          disabled={acting}
          size="sm"
          className="font-semibold"
        >
          {acting ? (
            <PulsingDots size="sm" className="mr-1.5" />
          ) : (
            <CheckCircle2 className="w-3 h-3 mr-1.5" />
          )}
          {isContractOwner ? 'Approve & Register On-Chain' : 'Approve'}
        </Button>
        <Button
          onClick={onReject}
          disabled={acting}
          size="sm"
          variant="destructive"
          className="font-semibold"
        >
          <XCircle className="w-3 h-3 mr-1.5" />
          Reject
        </Button>
      </div>
    </>
  );
}

export function ChainStatusPanel({
  appId,
  chainStatus,
  chainError,
  onRetry,
}: {
  appId: string;
  chainStatus: ChainStatus;
  chainError: string;
  onRetry: () => void;
}) {
  if (chainStatus === 'idle') return null;

  if (chainStatus === 'registering') {
    return (
      <div className="portal-blue-panel mb-4 rounded-[1rem] border p-4">
        <div className="flex items-center gap-2">
          <PulsingDots size="md" className="portal-blue-text" />
          <span className="text-sm">
            Registering on <span className="font-mono">{REWARDS_CONTRACT}</span>…
          </span>
        </div>
      </div>
    );
  }

  if (chainStatus === 'done') {
    return (
      <div className="portal-green-panel mb-4 rounded-[1rem] border p-4">
        <div className="flex items-center gap-2">
          <Link2 className="portal-green-icon w-4 h-4" />
          <span className="text-sm font-semibold">Registered on-chain</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          <span className="font-mono">{appId}</span> registered on{' '}
          <span className="font-mono">{REWARDS_CONTRACT}</span>
        </p>
      </div>
    );
  }

  if (chainStatus === 'error') {
    return (
      <div className="portal-red-panel mb-4 rounded-[1rem] border p-4">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="portal-red-icon w-4 h-4" />
          <span className="text-sm font-semibold">On-chain registration failed</span>
        </div>
        <p className="portal-red-text text-xs">{chainError}</p>
        <Button onClick={onRetry} size="sm" variant="outline" className="mt-2 text-xs">
          Retry On-Chain Registration
        </Button>
      </div>
    );
  }

  return (
    <div className="portal-amber-panel mb-4 rounded-[1rem] border p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="portal-amber-icon w-4 h-4" />
        <span className="text-sm font-semibold">On-chain registration needed</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Connect as{' '}
        <span className="portal-purple-text font-mono">{CONTRACT_OWNER_WALLET}</span>{' '}
        to register <span className="font-mono">{appId}</span> on the rewards
        contract.
      </p>
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