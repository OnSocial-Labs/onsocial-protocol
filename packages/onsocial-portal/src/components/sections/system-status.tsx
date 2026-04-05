'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe, FileCode2 } from 'lucide-react';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { section } from '@/lib/section-styles';
import {
  BOOST_CONTRACT,
  CORE_CONTRACT,
  REWARDS_CONTRACT,
  SCARCES_CONTRACT,
  TOKEN_CONTRACT,
  VESTING_CONTRACT,
  viewAccount,
  viewContractAt,
} from '@/lib/near-rpc';
import { portalColors } from '@/lib/portal-colors';
import { ACTIVE_API_URL } from '@/lib/portal-config';

/* ── Types ── */

interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | null;
  responseTime?: number;
}

interface ContractHealth {
  name: string;
  accountId: string;
  status: 'up' | 'degraded' | 'down';
  responseTime: number;
}

/* ── Contract probes ── */

const CONTRACT_PROBES = [
  {
    name: 'Core',
    accountId: CORE_CONTRACT,
    probe: () =>
      viewContractAt<{ version: string }>(CORE_CONTRACT, 'get_version', {}),
  },
  {
    name: 'Boost',
    accountId: BOOST_CONTRACT,
    probe: () => viewContractAt(BOOST_CONTRACT, 'get_stats', {}),
  },
  {
    name: 'Token',
    accountId: TOKEN_CONTRACT,
    probe: () => viewContractAt(TOKEN_CONTRACT, 'ft_metadata', {}),
  },
  {
    name: 'Rewards',
    accountId: REWARDS_CONTRACT,
    probe: () => viewContractAt(REWARDS_CONTRACT, 'get_contract_info', {}),
  },
  {
    name: 'Scarces',
    accountId: SCARCES_CONTRACT,
    probe: () => viewContractAt(SCARCES_CONTRACT, 'get_contract_info', {}),
  },
  {
    name: 'Vesting',
    accountId: VESTING_CONTRACT,
    probe: () => viewContractAt(VESTING_CONTRACT, 'get_status', {}),
  },
] as const;

/* ── Helpers ── */

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

function dotColor(
  status: string | null | undefined,
  responseTime?: number
): string {
  if (!status || status === 'down') return 'bg-[var(--portal-red)]';
  if (status === 'degraded') return 'bg-[var(--portal-amber)]';
  if (responseTime === undefined) return 'bg-muted-foreground';
  if (responseTime <= 300) return 'bg-[var(--portal-green)]';
  if (responseTime <= 1000) return 'bg-[var(--portal-amber)]';
  return 'bg-[var(--portal-red)]';
}

function latencyColor(responseTime?: number): string {
  if (responseTime === undefined) return 'text-muted-foreground';
  if (responseTime <= 300) return 'portal-green-text';
  if (responseTime <= 1000) return 'portal-amber-text';
  return 'portal-red-text';
}

/* ── Row component ── */

function StatusRow({
  name,
  secondary,
  status,
  responseTime,
  loading: isLoading,
}: {
  name: string;
  secondary?: string;
  status: string | null | undefined;
  responseTime?: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${isLoading ? 'bg-muted-foreground/40 animate-pulse' : dotColor(status, responseTime)}`}
        />
        <div className="min-w-0">
          <span className="text-sm font-medium">{name}</span>
          {secondary ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {secondary}
            </p>
          ) : null}
        </div>
      </div>
      <span
        className={`shrink-0 text-xs font-mono tabular-nums ${isLoading ? 'text-muted-foreground/40' : latencyColor(responseTime)}`}
      >
        {isLoading || responseTime === undefined ? '—' : `${responseTime}ms`}
      </span>
    </div>
  );
}

/* ── Main component ── */

export function SystemStatus() {
  const [services, setServices] = useState<ServiceHealth[]>([
    { name: 'Gateway', status: null },
    { name: 'Graph', status: null },
    { name: 'Storage', status: null },
    { name: 'Relay', status: null },
  ]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractHealth[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);

  const checkServices = useCallback(async () => {
    const apiUrl = ACTIVE_API_URL;
    const paths = [
      '/health',
      '/graph/health',
      '/storage/health',
      '/relay/health',
    ];
    const names = ['Gateway', 'Graph', 'Storage', 'Relay'];

    const results = await Promise.all(
      paths.map(async (path, i) => {
        const start = performance.now();
        try {
          const res = await fetch(`${apiUrl}${path}`, {
            signal: AbortSignal.timeout(5000),
          });
          return {
            name: names[i],
            status: (res.ok ? 'up' : 'down') as 'up' | 'down',
            responseTime: Math.round(performance.now() - start),
          };
        } catch {
          return {
            name: names[i],
            status: 'down' as const,
            responseTime: undefined,
          };
        }
      })
    );

    setServices(results);
    setServicesLoading(false);
  }, []);

  const checkContracts = useCallback(async () => {
    const results = await Promise.all(
      CONTRACT_PROBES.map(async ({ name, accountId, probe }) => {
        const start = performance.now();
        try {
          const result = await withTimeout(probe(), 8000);
          const elapsed = Math.round(performance.now() - start);
          return {
            name,
            accountId,
            status: (result === null ? 'degraded' : 'up') as 'up' | 'degraded',
            responseTime: elapsed,
          };
        } catch {
          const elapsed = Math.round(performance.now() - start);
          try {
            await withTimeout(viewAccount(accountId), 5000);
            return {
              name,
              accountId,
              status: 'degraded' as const,
              responseTime: elapsed,
            };
          } catch {
            return {
              name,
              accountId,
              status: 'down' as const,
              responseTime: elapsed,
            };
          }
        }
      })
    );

    setContracts(results);
    setContractsLoading(false);
  }, []);

  useEffect(() => {
    void checkServices();
    const interval = setInterval(checkServices, 30_000);
    return () => clearInterval(interval);
  }, [checkServices]);

  useEffect(() => {
    void checkContracts();
    const interval = setInterval(checkContracts, 60_000);
    return () => clearInterval(interval);
  }, [checkContracts]);

  const allUp =
    !servicesLoading &&
    services.every((s) => s.status === 'up') &&
    !contractsLoading &&
    contracts.every((c) => c.status === 'up');

  const isLoading = servicesLoading && contractsLoading;

  const headlineDot = isLoading
    ? 'bg-muted-foreground/40 animate-pulse'
    : allUp
      ? 'bg-[var(--portal-green)] animate-pulse'
      : 'bg-[var(--portal-amber)]';

  return (
    <section id="status" className={`${section.py} relative`}>
      <div className={section.container}>
        <h2 className={section.heading}>
          <span className="inline-flex items-center gap-2.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${headlineDot}`}
              aria-hidden="true"
            />
            {isLoading ? 'Checking' : allUp ? 'All Operational' : 'Degraded'}
          </span>
        </h2>

        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className="overflow-hidden"
        >
          <div className={section.card}>
            <div className="flex flex-col items-center text-center mb-4">
              <span className="portal-blue-text inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]">
                <Globe className="h-3.5 w-3.5" />
                Services
              </span>
            </div>
            {servicesLoading ? (
              <div className="flex min-h-16 items-center justify-center">
                <PulsingDots size="md" />
              </div>
            ) : (
              <div className="divide-fade-item">
                {services.map((s) => (
                  <StatusRow
                    key={s.name}
                    name={s.name}
                    status={s.status}
                    responseTime={s.responseTime}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mx-5 h-px divider-section lg:mx-6" />

          <div className={section.card}>
            <div className="flex flex-col items-center text-center mb-4">
              <span className="portal-green-text inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]">
                <FileCode2 className="h-3.5 w-3.5" />
                Contracts
              </span>
            </div>
            {contractsLoading ? (
              <div className="flex min-h-16 items-center justify-center">
                <PulsingDots size="md" />
              </div>
            ) : (
              <div className="divide-fade-item">
                {contracts.map((c) => (
                  <StatusRow
                    key={c.name}
                    name={c.name}
                    secondary={c.accountId}
                    status={c.status}
                    responseTime={c.responseTime}
                  />
                ))}
              </div>
            )}
          </div>
        </SurfacePanel>
      </div>
    </section>
  );
}
