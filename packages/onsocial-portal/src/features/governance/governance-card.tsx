'use client';

import { useEffect, useState } from 'react';
import {
  ApprovedConfigPanel,
  GovernanceStatusPanel,
  StatusBadge,
} from '@/features/governance/app-card-parts';
import type {
  Application,
  GovernanceProposal,
} from '@/features/governance/types';
import { viewContract, type OnChainAppConfig } from '@/lib/near-rpc';

export function GovernanceCard({ app }: { app: Application }) {
  const [onChainConfig, setOnChainConfig] = useState<OnChainAppConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(false);
  const proposal: GovernanceProposal | null = app.governance_proposal;

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

  return (
    <div className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold tracking-[-0.02em]">{app.label}</h3>
          <p className="text-sm text-muted-foreground font-mono">
            {app.app_id}
          </p>
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
        {app.website_url && (
          <p>
            <span className="text-muted-foreground">Website:</span>{' '}
            <a
              href={app.website_url}
              target="_blank"
              rel="noreferrer"
              className="portal-action-link"
            >
              {app.website_url}
            </a>
          </p>
        )}
        {app.telegram_handle && (
          <p>
            <span className="text-muted-foreground">Telegram:</span>{' '}
            <span className="portal-blue-text">{app.telegram_handle}</span>
          </p>
        )}
        {app.x_handle && (
          <p>
            <span className="text-muted-foreground">X:</span>{' '}
            <span className="portal-blue-text">{app.x_handle}</span>
          </p>
        )}
      </div>

      <GovernanceStatusPanel
        appId={app.app_id}
        proposal={proposal}
        creationStatus="idle"
        creationError=""
      />

      {app.status === 'proposal_submitted' && (
        <div className="space-y-3">
          <ApprovedConfigPanel
            configLoading={configLoading}
            onChainConfig={onChainConfig}
          />
        </div>
      )}

      {app.status === 'approved' && (
        <ApprovedConfigPanel
          configLoading={configLoading}
          onChainConfig={onChainConfig}
        />
      )}
    </div>
  );
}
