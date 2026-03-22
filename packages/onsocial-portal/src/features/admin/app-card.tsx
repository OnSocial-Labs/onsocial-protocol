'use client';

import { useEffect, useState } from 'react';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { CheckCircle2 } from 'lucide-react';
import { approveApp, rejectApp, reopenApp } from '@/features/admin/api';
import {
  CONTRACT_OWNER_WALLETS,
  RELAYER_ACCOUNT,
} from '@/features/admin/constants';
import {
  ApprovedConfigPanel,
  ChainStatusPanel,
  PendingControls,
  StatusBadge,
} from '@/features/admin/app-card-parts';
import {
  hasErrors,
  validateParams,
} from '@/features/admin/param-utils';
import type {
  Application,
  ChainStatus,
  ContractParams,
  ParamErrors,
} from '@/features/admin/types';
import {
  viewContract,
  socialToYocto,
  REWARDS_CONTRACT,
  type OnChainAppConfig,
} from '@/lib/near-rpc';

export function AppCard({
  app,
  wallet,
  walletInstance,
  onUpdate,
}: {
  app: Application;
  wallet: string;
  walletInstance: NearWalletBase | null;
  onUpdate: () => void;
}) {
  const [notes, setNotes] = useState(app.admin_notes ?? '');
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<'approved' | null>(null);
  const [chainStatus, setChainStatus] = useState<ChainStatus>('idle');
  const [chainError, setChainError] = useState('');
  const [error, setError] = useState('');
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(false);
  const [params, setParams] = useState<ContractParams>({
    dailyCap: '1',
    rewardPerAction: '0.1',
    totalBudget: '10000',
    dailyBudget: '0',
  });
  const [paramErrors, setParamErrors] = useState<ParamErrors>({});

  const isContractOwner = CONTRACT_OWNER_WALLETS.includes(wallet.toLowerCase());

  useEffect(() => {
    if (app.status !== 'approved') return;
    setConfigLoading(true);
    viewContract<OnChainAppConfig>('get_app_config', { app_id: app.app_id })
      .then((config) => setOnChainConfig(config))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, [app.status, app.app_id]);

  const registerOnChain = async () => {
    if (!walletInstance) throw new Error('No wallet connected');

    await walletInstance.signAndSendTransaction({
      receiverId: REWARDS_CONTRACT,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'register_app',
            args: {
              config: {
                app_id: app.app_id,
                label: app.label,
                daily_cap: socialToYocto(params.dailyCap),
                reward_per_action: socialToYocto(params.rewardPerAction),
                authorized_callers: [RELAYER_ACCOUNT],
                total_budget: socialToYocto(params.totalBudget),
                daily_budget: socialToYocto(params.dailyBudget),
              },
            },
            gas: '30000000000000',
            deposit: '0',
          },
        },
      ],
    });
  };

  const handleApproveAndRegister = async () => {
    if (isContractOwner) {
      const errors = validateParams(params);
      setParamErrors(errors);
      if (hasErrors(errors)) return;
    }

    setActing(true);
    setError('');
    try {
      await approveApp(wallet, app.app_id, notes);
      setResult('approved');

      if (walletInstance && isContractOwner) {
        setChainStatus('registering');
        await registerOnChain();
        setChainStatus('done');
      } else {
        setChainStatus('skipped');
      }

      onUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed';
      if (result) {
        setChainError(message);
        setChainStatus('error');
      } else {
        setError(message);
      }
    } finally {
      setActing(false);
    }
  };

  const retryOnChain = async () => {
    const errors = validateParams(params);
    setParamErrors(errors);
    if (hasErrors(errors)) return;

    setChainStatus('registering');
    setChainError('');
    try {
      await registerOnChain();
      setChainStatus('done');
    } catch (err) {
      setChainError(
        err instanceof Error ? err.message : 'On-chain registration failed'
      );
      setChainStatus('error');
    }
  };

  const handleReject = async () => {
    setActing(true);
    setError('');
    try {
      await rejectApp(wallet, app.app_id, notes);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActing(false);
    }
  };

  const handleReopen = async () => {
    setActing(true);
    setError('');
    try {
      await reopenApp(wallet, app.app_id);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold tracking-[-0.02em]">{app.label}</h3>
          <p className="text-sm text-muted-foreground font-mono">{app.app_id}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <div className="mb-4 grid gap-2 text-sm">
        {app.wallet_id && (
          <p>
            <span className="text-muted-foreground">Wallet:</span>{' '}
            <span className="portal-green-text font-mono">{app.wallet_id}</span>
          </p>
        )}
        {app.description && (
          <p>
            <span className="text-muted-foreground">Description:</span>{' '}
            {app.description}
          </p>
        )}
        {app.expected_users && (
          <p>
            <span className="text-muted-foreground">Expected users:</span>{' '}
            {app.expected_users}
          </p>
        )}
        {app.contact && (
          <p>
            <span className="text-muted-foreground">Contact:</span> {app.contact}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Applied: {new Date(app.created_at).toLocaleDateString()}
          {app.reviewed_at &&
            ` · Reviewed: ${new Date(app.reviewed_at).toLocaleDateString()}`}
        </p>
      </div>

      {app.status === 'pending' && !result && (
        <PendingControls
          app={app}
          isContractOwner={isContractOwner}
          params={params}
          setParams={setParams}
          paramErrors={paramErrors}
          setParamErrors={setParamErrors}
          notes={notes}
          setNotes={setNotes}
          error={error}
          acting={acting}
          onApprove={handleApproveAndRegister}
          onReject={handleReject}
        />
      )}

      {app.status === 'rejected' && (
        <div className="mb-4 rounded-[1.25rem] border border-border/50 bg-background/30 p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Reopen this application to let the same wallet submit an updated
            version and re-enter review.
          </p>
          {error && <p className="portal-red-text text-xs mb-2">{error}</p>}
          <button
            onClick={handleReopen}
            disabled={acting}
            className="portal-purple-surface inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
          >
            {acting ? 'Reopening…' : 'Reopen for reapply'}
          </button>
        </div>
      )}

      {result && (
        <div className="portal-green-panel mb-4 rounded-[1rem] border p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="portal-green-icon w-4 h-4" />
            <span className="text-sm font-semibold">
              Approved — API key sent to partner
            </span>
          </div>
        </div>
      )}

      <ChainStatusPanel
        appId={app.app_id}
        chainStatus={chainStatus}
        chainError={chainError}
        onRetry={retryOnChain}
      />

      {app.status === 'approved' && (
        <ApprovedConfigPanel
          configLoading={configLoading}
          onChainConfig={onChainConfig}
        />
      )}
    </div>
  );
}