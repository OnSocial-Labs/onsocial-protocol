'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, FileCode2 } from 'lucide-react';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { section } from '@/lib/section-styles';
import type { PortalContractHealth } from '@/lib/portal-system-status-server';
import { ACTIVE_API_URL } from '@/lib/portal-config';
import {
  deriveSystemHeadline,
  indexerLiveLabel,
  parseLiveHealthPayload,
  rpcLiveLabel,
  systemStatusLabel,
  type PortalLiveHealth,
  type SystemStatusWord,
} from '@/lib/system-status-headline';

interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | null;
}

type ContractHealth = PortalContractHealth;

const SERVICE_NAMES = ['Gateway', 'Graph', 'Storage', 'Relay'] as const;

function dotColor(status: string | null | undefined): string {
  if (status === 'up') return 'bg-[var(--portal-green)]';
  if (status === 'degraded') return 'bg-[var(--portal-amber)]';
  if (status === 'down') return 'bg-[var(--portal-red)]';
  return 'bg-muted-foreground';
}

function wordColor(status: string | null | undefined): string {
  if (status === 'up') return 'portal-green-text';
  if (status === 'degraded') return 'portal-amber-text';
  if (status === 'down') return 'portal-red-text';
  return 'text-muted-foreground';
}

function LiveTicks({
  tone,
  still = false,
}: {
  tone: SystemStatusWord | null;
  still?: boolean;
}) {
  const moving = !still && (tone === 'up' || tone === 'degraded');
  return (
    <span className="inline-flex h-3 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`portal-live-tick w-[2px] rounded-full ${
            tone === 'up'
              ? 'bg-[var(--portal-green)]'
              : tone === 'degraded'
                ? 'bg-[var(--portal-amber)]'
                : 'bg-muted-foreground/35'
          } ${moving ? 'portal-live-tick-run' : ''} ${
            tone === 'degraded' ? 'portal-live-tick-catching' : ''
          }`}
          style={moving ? { animationDelay: `${bar * 140}ms` } : undefined}
        />
      ))}
    </span>
  );
}

function rpcMsColor(ms: number): string {
  if (ms <= 300) return 'portal-green-text';
  if (ms <= 800) return 'portal-amber-text';
  return 'portal-red-text';
}

function StatusRow({
  name,
  secondary,
  status,
}: {
  name: string;
  secondary?: string;
  status: SystemStatusWord | null;
}) {
  const label = systemStatusLabel(status);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(status)}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <span className="text-sm font-medium">{name}</span>
          {secondary ? (
            <p className="truncate portal-type-label text-muted-foreground">
              {secondary}
            </p>
          ) : null}
        </div>
      </div>
      <span
        className={`shrink-0 text-xs font-medium tabular-nums ${wordColor(status)}`}
      >
        {label}
      </span>
    </div>
  );
}

export function SystemStatus() {
  const [services, setServices] = useState<ServiceHealth[]>(
    SERVICE_NAMES.map((name) => ({ name, status: null }))
  );
  const [servicesLoading, setServicesLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractHealth[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [contractsUnavailable, setContractsUnavailable] = useState(false);
  const [contractsStale, setContractsStale] = useState(false);
  const [live, setLive] = useState<PortalLiveHealth | null>(null);
  const [livePhase, setLivePhase] = useState<
    'loading' | 'ready' | 'unsupported'
  >('loading');
  const contractsRef = useRef<ContractHealth[]>([]);
  const liveRef = useRef<PortalLiveHealth | null>(null);
  const liveSupportedRef = useRef(true);

  const checkServices = useCallback(async () => {
    const apiUrl = ACTIVE_API_URL;
    const paths = [
      '/health',
      '/graph/health',
      '/storage/health',
      '/relay/health',
    ];

    const results = await Promise.all(
      paths.map(async (path, index) => {
        try {
          const res = await fetch(`${apiUrl}${path}`, {
            signal: AbortSignal.timeout(5000),
          });
          return {
            name: SERVICE_NAMES[index],
            status: (res.ok ? 'up' : 'down') as 'up' | 'down',
          };
        } catch {
          return {
            name: SERVICE_NAMES[index],
            status: 'down' as const,
          };
        }
      })
    );

    setServices(results);
    setServicesLoading(false);
  }, []);

  const checkContracts = useCallback(async () => {
    try {
      const response = await fetch('/api/system/status', { cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as {
        contracts?: ContractHealth[];
      } | null;
      const next = response.ok ? body?.contracts : undefined;

      if (!next?.length) {
        if (contractsRef.current.length > 0) {
          setContractsStale(true);
        } else {
          setContractsUnavailable(true);
        }
        return;
      }

      contractsRef.current = next;
      setContracts(next);
      setContractsStale(false);
      setContractsUnavailable(false);
    } catch {
      if (contractsRef.current.length > 0) {
        setContractsStale(true);
      } else {
        setContractsUnavailable(true);
      }
    } finally {
      setContractsLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'hidden') return;
      void checkServices();
    };
    const initial = window.setTimeout(run, 0);
    const interval = window.setInterval(run, 30_000);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', run);
    };
  }, [checkServices]);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'hidden') return;
      void checkContracts();
    };
    const initial = window.setTimeout(run, 0);
    const interval = window.setInterval(run, 60_000);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', run);
    };
  }, [checkContracts]);

  const checkLive = useCallback(async () => {
    if (!liveSupportedRef.current) return;
    try {
      const response = await fetch(`${ACTIVE_API_URL}/health/live`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 404) {
        liveSupportedRef.current = false;
        liveRef.current = null;
        setLive(null);
        setLivePhase('unsupported');
        return;
      }
      const parsed = parseLiveHealthPayload(
        await response.json().catch(() => null)
      );
      if (!response.ok || !parsed) {
        if (liveRef.current) return;
        const failed: PortalLiveHealth = {
          rpc: { status: 'down', ms: null },
          indexer: {
            status: 'down',
            lagBlocks: null,
            height: null,
            updateNeeded: false,
          },
        };
        liveRef.current = failed;
        setLive(failed);
        setLivePhase('ready');
        return;
      }
      liveRef.current = parsed;
      setLive(parsed);
      setLivePhase('ready');
    } catch {
      if (!liveSupportedRef.current || liveRef.current) return;
      const failed: PortalLiveHealth = {
        rpc: { status: 'down', ms: null },
        indexer: {
          status: 'down',
          lagBlocks: null,
          height: null,
          updateNeeded: false,
        },
      };
      liveRef.current = failed;
      setLive(failed);
      setLivePhase('ready');
    }
  }, []);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'hidden') return;
      void checkLive();
    };
    const initial = window.setTimeout(run, 0);
    const interval = window.setInterval(run, 15_000);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', run);
    };
  }, [checkLive]);

  const headline = deriveSystemHeadline({
    servicesLoading,
    contractsLoading,
    services,
    contracts,
    contractsUnavailable,
    liveLoading: livePhase === 'loading',
    live:
      livePhase === 'ready' && live
        ? [{ status: live.rpc.status }, { status: live.indexer.status }]
        : null,
  });
  const headlineDot =
    headline === 'Checking'
      ? 'bg-muted-foreground/40 animate-pulse'
      : headline === 'All Operational'
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
            {headline}
          </span>
        </h2>

        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="none"
          className="overflow-hidden"
        >
          <div className={section.card}>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="portal-blue-text inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]">
                <Globe className="h-3.5 w-3.5" />
                Services
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                Reachable from here
              </p>
            </div>
            {servicesLoading ? (
              <div className="flex min-h-16 items-center justify-center">
                <PulsingDots size="md" />
              </div>
            ) : (
              <div className="divide-fade-item">
                {services.map((service) => (
                  <StatusRow
                    key={service.name}
                    name={service.name}
                    status={service.status}
                  />
                ))}
              </div>
            )}
            {livePhase === 'ready' && live && !servicesLoading ? (
              <>
                <div className="mx-0 my-4 h-px divider-section" />
                <div className="divide-fade-item">
                  <div
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
                    aria-label={`OnSocial RPC, ${rpcLiveLabel(live.rpc.status, live.rpc.ms)}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(live.rpc.status)} ${
                          live.rpc.status === 'up' ? 'portal-rpc-pulse' : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium">OnSocial RPC</span>
                    </div>
                    <span
                      key={live.rpc.ms ?? live.rpc.status}
                      className={`portal-live-ms shrink-0 text-xs font-medium tabular-nums ${
                        live.rpc.status === 'up' && live.rpc.ms != null
                          ? rpcMsColor(live.rpc.ms)
                          : wordColor(live.rpc.status)
                      }`}
                    >
                      {rpcLiveLabel(live.rpc.status, live.rpc.ms)}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between gap-3 py-2.5 last:pb-0"
                    aria-label={`Indexer, ${indexerLiveLabel(live.indexer.status, live.indexer.updateNeeded)}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(live.indexer.status)}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium">Indexer</span>
                        {live.indexer.status === 'degraded' &&
                        live.indexer.lagBlocks != null ? (
                          <p className="truncate portal-type-label text-muted-foreground">
                            {live.indexer.lagBlocks.toLocaleString()} behind
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2">
                      <LiveTicks
                        tone={live.indexer.status}
                        still={live.indexer.updateNeeded}
                      />
                      <span
                        className={`text-xs font-medium ${wordColor(live.indexer.status)}`}
                      >
                        {indexerLiveLabel(
                          live.indexer.status,
                          live.indexer.updateNeeded
                        )}
                      </span>
                    </span>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="mx-5 h-px divider-section lg:mx-6" />

          <div className={section.card}>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="portal-green-text inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]">
                <FileCode2 className="h-3.5 w-3.5" />
                Contracts
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {contractsStale ? 'Last check failed' : 'Read from the chain'}
              </p>
            </div>
            {contractsLoading ? (
              <div className="flex min-h-16 items-center justify-center">
                <PulsingDots size="md" />
              </div>
            ) : contractsUnavailable && contracts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Couldn&apos;t check the contracts.
              </p>
            ) : (
              <div className="divide-fade-item">
                {contracts.map((contract) => (
                  <StatusRow
                    key={contract.name}
                    name={contract.name}
                    secondary={contract.accountId}
                    status={contract.status}
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
